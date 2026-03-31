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
    // Verify request is from authorized source
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.SYNC_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { month, totals, guardPosts, syncedAt } = body;

    if (!month || !guardPosts) {
      return NextResponse.json({ error: 'Missing required fields: month, guardPosts' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // 1. Upsert guard posts
    const guardPostMap: Record<string, string> = {};
    for (const gp of guardPosts) {
      const { data, error } = await supabase
        .from('guard_posts')
        .upsert({
          external_id: gp.guardPostId,
          number: gp.number,
          callsign: gp.callsign,
          name: gp.name,
          address: gp.address,
          rate: gp.rate,
          synced_at: syncedAt,
        }, { onConflict: 'external_id' })
        .select('id, external_id')
        .single();

      if (error) {
        console.error('Guard post upsert error:', error);
        continue;
      }
      guardPostMap[gp.guardPostId] = data.id;
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
            surname: guard.surname,
            first_name: guard.firstName,
            patronymic: guard.patronymic,
            iin: guard.iin,
            is_official: guard.isOfficial,
            synced_at: syncedAt,
          }, { onConflict: 'external_id' })
          .select('id')
          .single();

        if (guardError) {
          console.error('Guard upsert error:', guardError);
          continue;
        }

        // Upsert timesheet entry
        const { error: tsError } = await supabase
          .from('timesheet_entries')
          .upsert({
            month: month,
            guard_post_id: gpId,
            guard_id: guardData.id,
            rate: gp.rate,
            days_worked: guard.daysWorked,
            shifts_worked: guard.shiftsWorked,
            total_hours: guard.totalHours,
            salary: guard.salary,
            is_official: guard.isOfficial,
            synced_at: syncedAt,
          }, { onConflict: 'month,guard_post_id,guard_id' });

        if (tsError) {
          console.error('Timesheet upsert error:', tsError);
          continue;
        }
        totalEntries++;
      }
    }

    // 3. Log sync
    await supabase.from('timesheet_sync_log').insert({
      month: month,
      total_guards: totals.totalGuards,
      official_count: totals.officialCount,
      unofficial_count: totals.unofficialCount,
      total_salary: totals.totalSalary,
      official_salary: totals.officialSalary,
      unofficial_salary: totals.unofficialSalary,
      tax_estimate: totals.taxEstimate,
      synced_at: syncedAt,
    });

    return NextResponse.json({
      success: true,
      message: `Synced ${totalEntries} timesheet entries for ${guardPosts.length} posts`,
      month,
      totalEntries,
      totals,
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
