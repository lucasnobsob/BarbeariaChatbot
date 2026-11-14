function stripAccentsAndControl(input: string, maxLen: number): string {
  const clean = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,/-]/g, '')
    .trim();
  return clean.slice(0, maxLen);
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface StaticPixBrCodeInput {
  pixKey: string;
  receiverName: string;
  receiverCity: string;
  amountInCents: number;
  txId: string;
}

/**
 * Generates an EMV-compliant BACEN Pix BR Code ("Copia e Cola") payload.
 */
export function buildStaticPixBrCode(input: StaticPixBrCodeInput): string {
  const pixKey = input.pixKey.trim();
  if (!pixKey) {
    throw new Error('Chave Pix não configurada.');
  }

  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
  const name = stripAccentsAndControl(input.receiverName || 'BarberSaaS', 25) || 'BarberSaaS';
  const city = stripAccentsAndControl(input.receiverCity || 'SAO PAULO', 15) || 'SAO PAULO';
  const amount = (input.amountInCents / 100).toFixed(2);
  const safeTxId =
    input.txId.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || 'BARBERSAAS';

  const body =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (input.amountInCents > 0 ? tlv('54', amount) : '') +
    tlv('58', 'BR') +
    tlv('59', name.toUpperCase()) +
    tlv('60', city.toUpperCase()) +
    tlv('62', tlv('05', safeTxId)) +
    '6304';

  return `${body}${crc16Ccitt(body)}`;
}
