import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client (service role for upserts)
function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    // Accept dashboard URL and key from request body (server-side proxy)
    const body = await request.json();
    const { dashboardUrl, integrationKey, month } = body;

    // Option 1: Direct data push (legacy — data already provided)
    if (body.guardPosts && body.totals) {
      // Verify auth for direct push
      const authHeader = request.headers.get('authorization');
      if (!authHeader || authHeader !== `Bearer ${process.env.SYNC_SECRET_KEY}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return await saveTimesheetData(body);
    }

    // Option 2: Proxy fetch from TumarDashboard (new — server-to-server)
    if (!dashboardUrl || !integrationKey || !month) {
      return NextResponse.json(
        { error: 'Missing required fields: dashboardUrl, integrationKey, month' },
        { status: 400 }
      );
    }

    // Fetch from TumarDashboard (server-to-server, no CORS issues)
    const url = `${dashboardUrl.replace(/\/+$/, '')}/api/integration/timesheet-sync?month=${month}`;
    const fetchRes = await fetch(url, {
      headers: { 'X-Integration-Key': integrationKey },
    });

    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => '');
      return NextResponse.json(
        { error: `TumarDashboard вернул ${fetchRes.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await fetchRes.json();

    if (!data.guardPosts || !data.totals) {
      return NextResponse.json(
        { error: 'TumarDashboard вернул некорректные данные (нет guardPosts или totals)' },
        { status: 502 }
      );
    }

    // Save to Supabase
    return await saveTimesheetData(data);

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}

async function saveTimesheetData(body: any) {
  const { month, totals, guardPosts, syncedAt } = body;

  if (!month || !guardPosts) {
    return NextResponse.json({ error: 'Missing required fields: month, guardPosts' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Debug: check env vars
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      error: `Missing env vars: SUPABASE_URL=${!!supabaseUrl}, SERVICE_KEY=${!!serviceKey}`,
    }, { status: 500 });
  }

  const supabase = getServiceClient();
  const errors: string[] = [];

  // 1. Upsert guard posts
  const guardPostMap: Record<string, string> = {};
  for (const gp of guardPosts) {
    const { data, error } = await supabase
      .from('guard_posts')
      .upsert({
        external_id: gp.guardPostId,
        number: gp.number || '',
        callsign: gp.callsign || '',
        name: gp.name || '',
        address: gp.address || '',
        rate: gp.rate || 0,
        synced_at: syncedAt || new Date().toISOString(),
      }, { onConflict: 'external_id' })
      .select('id, external_id')
      .single();

    if (error) {
      errors.push(`GuardPost[${gp.callsign}]: ${error.message} (code: ${error.code}, details: ${error.details})`);
      continue;
    }
    guardPostMap[gp.guardPostId] = data.id;
  }

  // If ALL guard posts failed, return error immediately with details
  if (Object.keys(guardPostMap).length === 0 && guardPosts.length > 0) {
    return NextResponse.json({
      error: 'All guard post upserts failed',
      details: errors.slice(0, 5),
      guardPostsSample: guardPosts.slice(0, 2).map((gp: any) => ({
        guardPostId: gp.guardPostId,
        callsign: gp.callsign,
        name: gp.name,
      })),
    }, { status: 500 });
  }

  // 2. Upsert guards and timesheet entries
  let totalEntries = 0;
  for (const gp of guardPosts) {
    const gpId = guardPostMap[gp.guardPostId];
    if (!gpId) continue;

    for (const guard of gp.guards) {
      // Upsert guard
      const { data: guardData, error: guardError } = await supabase
        .from('guards')
        .upsert({
          external_id: guard.guardId,
          surname: guard.surname || '',
          first_name: guard.firstName || '',
          patronymic: guard.patronymic || '',
          iin: guard.iin || '',
          is_official: guard.isOfficial || false,
          synced_at: syncedAt || new Date().toISOString(),
        }, { onConflict: 'external_id' })
        .select('id')
        .single();

      if (guardError) {
        errors.push(`Guard[${guard.surname}]: ${guardError.message} (code: ${guardError.code})`);
        continue;
      }

      // Upsert timesheet entry
      const { error: tsError } = await supabase
        .from('timesheet_entries')
        .upsert({
          month: month,
          guard_post_id: gpId,
          guard_id: guardData.id,
          rate: gp.rate || 0,
          days_worked: guard.daysWorked || 0,
          shifts_worked: guard.shiftsWorked || 0,
          total_hours: guard.totalHours || 0,
          salary: guard.salary || 0,
          is_official: guard.isOfficial || false,
          synced_at: syncedAt || new Date().toISOString(),
        }, { onConflict: 'month,guard_post_id,guard_id' });

      if (tsError) {
        errors.push(`Timesheet[${guard.surname}]: ${tsError.message} (code: ${tsError.code})`);
        continue;
      }
      totalEntries++;
    }
  }

  // 3. Log sync
  if (totals) {
    await supabase.from('timesheet_sync_log').insert({
      month: month,
      total_guards: totals.totalGuards,
      official_count: totals.officialCount,
      unofficial_count: totals.unofficialCount,
      total_salary: totals.totalSalary,
      official_salary: totals.officialSalary,
      unofficial_salary: totals.unofficialSalary,
      tax_estimate: totals.taxEstimate,
      synced_at: syncedAt || new Date().toISOString(),
    });
  }

  return NextResponse.json({
    success: true,
    message: `Synced ${totalEntries} timesheet entries for ${guardPosts.length} posts`,
    month,
    totalEntries,
    postsLinked: Object.keys(guardPostMap).length,
    totals,
    ...(errors.length > 0 ? { warnings: errors.slice(0, 10) } : {}),
  });
}
