import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { parseKaspi } from '@/lib/parsers/kaspi';
import { parseHalyk } from '@/lib/parsers/halyk';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parser;
    let text = '';
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text;
    } catch (e: any) {
      return NextResponse.json({ error: 'Failed to parse PDF file: ' + e.message }, { status: 500 });
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }

    // Attempt to identify the bank
    let transactions = [];
    let bankIdentified = 'unknown';

    if (text.includes('KASPI BANK') || text.includes('Kaspi Pay') || text.includes('Kaspi.kz')) {
      transactions = parseKaspi(text);
      bankIdentified = 'kaspi';
    } else if (text.includes('Народный Банк Казахстана') || text.includes('ВЫПИСКА ПО СЧЕТУ')) {
      transactions = parseHalyk(text);
      bankIdentified = 'narodniy';
    } else {
      return NextResponse.json({ error: 'Не удалось определить банк (Поддерживаются только Kaspi и Halyk Bank).' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      bank: bankIdentified,
      count: transactions.length,
      transactions 
    });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}
