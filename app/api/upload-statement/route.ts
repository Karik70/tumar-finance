import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import { parseKaspi } from '@/lib/parsers/kaspi';
import { parseHalyk } from '@/lib/parsers/halyk';
import { parseHalykExcel } from '@/lib/parsers/halyk-excel';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function requireAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const authError = await requireAuthenticatedUser(request);
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File is too large. Maximum size is 20 MB.' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();

    // Excel upload — parse directly without PDF extraction
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const transactions = parseHalykExcel(arrayBuffer);
      if (transactions.length === 0) {
        return NextResponse.json(
          { error: 'Не удалось распознать транзакции. Убедитесь что файл — выписка Народного банка в формате Excel.' },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, bank: 'narodniy', count: transactions.length, transactions });
    }

    // PDF upload
    const buffer = Buffer.from(arrayBuffer);
    let text = '';
    try {
      const result = await pdfParse(buffer);
      text = result.text;
    } catch (e: any) {
      return NextResponse.json({ error: 'Failed to parse PDF file: ' + e.message }, { status: 500 });
    }

    let transactions = [];
    let bankIdentified = 'unknown';

    if (text.includes('KASPI BANK') || text.includes('Kaspi Pay') || text.includes('Kaspi.kz')) {
      transactions = parseKaspi(text);
      bankIdentified = 'kaspi';
    } else if (text.includes('Народный Банк Казахстана') || text.includes('ВЫПИСКА ПО СЧЕТУ')) {
      transactions = parseHalyk(text);
      bankIdentified = 'narodniy';
    } else {
      return NextResponse.json({ error: 'Не удалось определить банк (Поддерживаются: Kaspi и Halyk Bank PDF, Halyk Bank Excel).' }, { status: 400 });
    }

    return NextResponse.json({ success: true, bank: bankIdentified, count: transactions.length, transactions });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}
