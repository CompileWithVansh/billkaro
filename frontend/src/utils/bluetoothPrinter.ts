// Direct Web Bluetooth Thermal Printer Integration (ESC/POS)
// Compatible with SC588, MPT-II, POS-58, Everycom, and standard 58mm thermal printers

import type { Bill, Item, User } from '../types';
import { getItemDesc, formatInvoiceNumber } from '../types';
import QRCode from 'qrcode';

// Common BLE GATT Service UUIDs used by 58mm / 80mm thermal receipt printers
const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common serial / transparent transmission
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC BLE serial service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Android POS thermal printer BLE service
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

let activeDevice: any = null;
let activeCharacteristic: any = null;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isPrinterConnected(): boolean {
  return Boolean(activeDevice && activeDevice.gatt && activeDevice.gatt.connected && activeCharacteristic);
}

export function getConnectedDeviceName(): string | null {
  if (isPrinterConnected() && activeDevice) {
    return activeDevice.name || 'Bluetooth POS Printer';
  }
  return typeof localStorage !== 'undefined' ? localStorage.getItem('billkaro_bt_printer_name') : null;
}

export async function ensurePrinterConnected(): Promise<boolean> {
  if (isPrinterConnected()) {
    return true;
  }

  // If activeDevice is in memory but GATT disconnected, reconnect to it
  if (activeDevice && activeDevice.gatt) {
    try {
      console.info('[Bluetooth] Reconnecting to activeDevice...');
      const server = await activeDevice.gatt.connect();
      for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              activeCharacteristic = c;
              return true;
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[Bluetooth] activeDevice reconnect failed:', e);
    }
  }

  // If browser remembers paired devices via getDevices()
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator && (navigator as any).bluetooth.getDevices) {
    try {
      const devices = await (navigator as any).bluetooth.getDevices();
      if (devices && devices.length > 0) {
        const device = devices[0];
        console.info('[Bluetooth] Reconnecting to previously paired device:', device.name);
        const server = await device.gatt.connect();
        for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
          try {
            const service = await server.getPrimaryService(serviceUuid);
            const chars = await service.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                activeDevice = device;
                activeCharacteristic = c;
                return true;
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[Bluetooth] getDevices auto-reconnect failed:', e);
    }
  }

  return false;
}

export async function disconnectPrinter(): Promise<void> {
  try {
    if (activeDevice && activeDevice.gatt && activeDevice.gatt.connected) {
      activeDevice.gatt.disconnect();
    }
  } catch (err) {
    console.warn('Bluetooth disconnect error:', err);
  } finally {
    activeDevice = null;
    activeCharacteristic = null;
  }
}

export async function connectPrinter(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      error: 'Web Bluetooth is not supported on this browser. Please open BillKaro in Google Chrome or Microsoft Edge.',
    };
  }

  try {
    // Request nearby Bluetooth devices with printer services
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_PRINTER_SERVICES,
    });

    if (!device) {
      return { success: false, error: 'No printer selected.' };
    }

    // Listen for disconnection
    device.addEventListener('gattserverdisconnected', () => {
      console.info('[Bluetooth] Printer disconnected.');
      activeDevice = null;
      activeCharacteristic = null;
    });

    const server = await device.gatt.connect();

    // Search for a writable characteristic across known or available services
    let writeChar: any = null;

    // Try primary services
    for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Continue searching other services
      }
    }

    // Fallback: If not found in known list, discover all primary services
    if (!writeChar) {
      try {
        const allServices = await server.getPrimaryServices();
        for (const service of allServices) {
          try {
            const chars = await service.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                writeChar = c;
                break;
              }
            }
            if (writeChar) break;
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn('Fallback service discovery error:', err);
      }
    }

    if (!writeChar) {
      server.disconnect();
      return {
        success: false,
        error: `Connected to "${device.name}", but could not find a writable thermal printer channel.`,
      };
    }

    activeDevice = device;
    activeCharacteristic = writeChar;

    // Store paired device name in localStorage for fast UI status
    try {
      localStorage.setItem('billkaro_bt_printer_name', device.name || 'Bluetooth Printer');
    } catch {}

    return { success: true, deviceName: device.name || 'Bluetooth Printer' };
  } catch (err: any) {
    console.error('Bluetooth connection error:', err);
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Pairing cancelled.' };
    }
    return { success: false, error: err.message || 'Could not connect to Bluetooth printer.' };
  }
}

// Low-level helper to write data chunks safely across BLE MTU limits
async function sendEscPosBytes(bytes: Uint8Array): Promise<void> {
  if (!activeCharacteristic) {
    throw new Error('No Bluetooth printer connected.');
  }

  // 60-byte chunks with 8ms pause: 4x faster transmission while staying safely within BLE MTU & printer buffer
  const CHUNK_SIZE = 60;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (activeCharacteristic.properties.writeWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

// Convert string to bytes with standard ASCII encoding
function textToBytes(text: string): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode(text);
}

// ESC/POS Builder class for 58mm (32 characters per line)
class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  init(): this {
    // ESC @ (Initialize printer)
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  alignCenter(): this {
    this.buffer.push(0x1b, 0x61, 0x01);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0x00);
    return this;
  }

  alignRight(): this {
    this.buffer.push(0x1b, 0x61, 0x02);
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  doubleHeight(enable: boolean): this {
    this.buffer.push(0x1d, 0x21, enable ? 0x10 : 0x00);
    return this;
  }

  text(str: string): this {
    const bytes = textToBytes(str);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  divider(char: string = '-'): this {
    this.bold(true);
    this.line(char.repeat(32));
    this.bold(false);
    return this;
  }

  // Two column line: left-aligned text and right-aligned text padded to 32 chars
  twoCol(left: string, right: string): this {
    let l = left;
    let r = right;
    // Guard against 32-column overflow that causes ugly mid-word wrapping
    if (l.length + r.length >= 31) {
      const maxR = Math.max(8, 31 - l.length);
      r = r.slice(0, maxR);
    }
    const spaceCount = Math.max(1, 32 - l.length - r.length);
    this.line(l + ' '.repeat(spaceCount) + r);
    return this;
  }

  // 4-column item row for 58mm: Name(14) | Qty(4) | Rate(6) | Amt(8) = 32 chars
  itemRow(name: string, qty: number, rate: number, amt: number): this {
    const truncatedName = name.length > 14 ? name.substring(0, 13) + '.' : name.padEnd(14, ' ');
    const qtyStr = String(qty).padStart(4, ' ');
    const rateStr = rate.toFixed(0).padStart(6, ' ');
    const amtStr = amt.toFixed(2).padStart(8, ' ');
    this.line(`${truncatedName}${qtyStr}${rateStr}${amtStr}`);
    return this;
  }

  // Universal ESC/POS Raster Bit-Image QR Code - 100% supported by PSF588, SC588 & all thermal printers
  rasterQrCode(text: string): this {
    try {
      // Use Error Correction Level 'L' (7%) for clean, chunky modules and instant scanning
      const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
      const modCount = qr.modules.size;
      const scale = 4; // Compact 4 dots per module (~1.5 cm) - maximum paper saving & fast print
      const quiet = 1; // 1 module quiet zone
      const totalModules = modCount + quiet * 2;
      const widthDots = totalModules * scale;
      const heightDots = widthDots;
      const bytesPerLine = Math.ceil(widthDots / 8);

      // Determine paper width (58mm = 384 dots, 80mm = 576 dots)
      const paperWidth = (typeof localStorage !== 'undefined' ? localStorage.getItem('billkaro_printer_paper_width') : null) || '58mm';
      const maxDots = paperWidth === '80mm' ? 576 : 384;

      // Calculate horizontal centering offset from left margin
      const leftPaddingDots = Math.max(0, Math.floor((maxDots - widthDots) / 2));
      const leftPaddingBytes = Math.floor(leftPaddingDots / 8);
      const totalBytesPerLine = leftPaddingBytes + bytesPerLine;

      // CRITICAL: Reset alignment to Left before raster image so printer does not double-shift the bitmap
      this.alignLeft();

      // GS v 0 0 xL xH yL yH (Standard ESC/POS raster bit image)
      this.buffer.push(0x1d, 0x76, 0x30, 0x00);
      this.buffer.push(totalBytesPerLine & 0xff, (totalBytesPerLine >> 8) & 0xff);
      this.buffer.push(heightDots & 0xff, (heightDots >> 8) & 0xff);

      for (let y = 0; y < heightDots; y++) {
        const modY = Math.floor(y / scale) - quiet;

        // Left padding for perfect horizontal center alignment
        for (let b = 0; b < leftPaddingBytes; b++) {
          this.buffer.push(0x00);
        }

        for (let xByte = 0; xByte < bytesPerLine; xByte++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const xDot = xByte * 8 + bit;
            const modX = Math.floor(xDot / scale) - quiet;
            if (modY >= 0 && modY < modCount && modX >= 0 && modX < modCount) {
              if (qr.modules.get(modY, modX)) {
                byteVal |= 1 << (7 - bit);
              }
            }
          }
          this.buffer.push(byteVal);
        }
      }

      // Restore center alignment for footer text
      this.alignCenter();
    } catch (err) {
      console.warn('Failed to build raster QR code:', err);
    }
    return this;
  }

  feed(lines: number = 3): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// Print a quick test receipt to verify connection
export async function printTestReceipt(): Promise<{ success: boolean; error?: string }> {
  if (!isPrinterConnected()) {
    return { success: false, error: 'No printer connected. Please pair with PSF588 / SC588 first.' };
  }

  try {
    const builder = new EscPosBuilder();
    builder
      .alignCenter()
      .doubleHeight(true)
      .bold(true)
      .line('BILLKARO POS')
      .doubleHeight(false)
      .bold(false)
      .line('Bluetooth Thermal Test')
      .divider('=')
      .alignLeft()
      .twoCol('Device:', getConnectedDeviceName() || 'PSF588')
      .twoCol('Status:', 'CONNECTED [OK]')
      .twoCol('Width:', '58mm (32 Col)')
      .twoCol('Time:', new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
      .divider('-')
      .alignCenter()
      .bold(true)
      .line('READY FOR HIGH-SPEED BILLING!')
      .bold(false)
      .line('Zero App Switching')
      .feed(3);

    await sendEscPosBytes(builder.getBytes());
    return { success: true };
  } catch (err: any) {
    console.error('Test print failed:', err);
    return { success: false, error: err.message || 'Test print failed.' };
  }
}

interface PrintReceiptParams {
  bill: Bill;
  user: User;
  invoiceNumber?: string;
  items?: Item[];
  subtotal: number;
  tax: number;
  total: number;
  discountType?: 'percent' | 'flat' | null;
  discountValue?: number;
  discountAmount?: number;
  paymentMethod?: string;
  cashAmount?: number | null;
  upiAmount?: number | null;
}

// Print full customer receipt via direct Bluetooth ESC/POS commands
export async function printDirectBluetoothReceipt(params: PrintReceiptParams): Promise<{ success: boolean; error?: string }> {
  const isConnected = await ensurePrinterConnected();
  if (!isConnected) {
    return { success: false, error: 'Printer not connected. Please ensure PSF588 is turned on and paired.' };
  }

  const { bill, user, items, subtotal, tax, total, discountAmount, discountValue, discountType, paymentMethod, upiAmount, invoiceNumber } = params;

  try {
    const builder = new EscPosBuilder();

    // 1. Feed 1 line at the top so the tear bar does NOT cut off the top of the restaurant name!
    builder.feed(1);

    // 2. Store Name & Info Header (Bold, Centered)
    const storeName = (user.storeName || 'RESTAURANT').trim().toUpperCase();
    builder
      .alignCenter()
      .doubleHeight(true)
      .bold(true);

    if (storeName.length <= 26) {
      builder.line(storeName);
    } else {
      // Split into 2 centered lines by words so long names never get clipped on the edges
      const words = storeName.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 26) {
          line1 = (line1 + ' ' + w).trim();
        } else {
          line2 = (line2 + ' ' + w).trim();
        }
      }
      builder.line(line1);
      if (line2) builder.line(line2);
    }

    builder
      .doubleHeight(false)
      .bold(false);

    if (user.address) builder.line(user.address);
    if (user.phone) builder.line(`Mob: ${user.phone}`);
    if (user.gstin) builder.line(`GSTIN: ${user.gstin}`);
    if (user.fssai) builder.line(`FSSAI: ${user.fssai}`);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Actual bill / invoice number (e.g. INV-0250) - never fallback to client tab ID
    const invNumber = invoiceNumber || (bill.savedBillId
      ? formatInvoiceNumber(bill.savedBillId)
      : (bill.id && !isNaN(Number(bill.id)) ? formatInvoiceNumber(bill.id) : 'INV-0001'));

    builder
      .twoCol(dateStr, timeStr)
      .twoCol('Bill No:', invNumber);

    if (bill.label && !bill.label.toLowerCase().startsWith('bill') && !bill.label.toLowerCase().startsWith('inv-')) {
      builder.twoCol('Table / Order:', bill.label.slice(0, 16));
    }

    builder
      .alignLeft()
      .bold(true)
      .line('Item           Qty  Rate     Amt')
      .bold(false)
      .divider('-');

    // Items
    for (const line of bill.lines) {
      const lineTotal = line.price * line.qty;
      builder.itemRow(line.name, line.qty, line.price, lineTotal);
      const catalogItem = items?.find((i) => i.id === line.itemId);
      const desc = getItemDesc(line) || (catalogItem ? getItemDesc(catalogItem) : '');
      if (desc) {
        builder.line(`  * ${desc.substring(0, 28)}`);
      }
    }

    builder.divider('-');

    // Totals
    const totalQty = bill.lines.reduce((s, l) => s + l.qty, 0);
    builder.twoCol(`Total Items (${totalQty}):`, `Rs ${subtotal.toFixed(2)}`);

    if (discountAmount && discountAmount > 0) {
      builder.twoCol(
        `Discount ${discountType === 'percent' ? `(${discountValue}%)` : ''}:`,
        `-Rs ${discountAmount.toFixed(2)}`
      );
    }

    if (tax > 0 && user.taxPercent) {
      const halfRate = +(user.taxPercent / 2).toFixed(2);
      builder.twoCol(`CGST (${halfRate}%):`, `Rs ${(tax / 2).toFixed(2)}`);
      builder.twoCol(`SGST (${halfRate}%):`, `Rs ${(tax / 2).toFixed(2)}`);
    }

    builder
      .bold(true)
      .doubleHeight(true)
      .twoCol('TOTAL:', `Rs ${total.toFixed(2)}`)
      .doubleHeight(false)
      .bold(false);

    // Dynamic UPI QR code (compact, zero wasted lines)
    const printQrEnabled = (typeof window !== 'undefined' && localStorage.getItem('billkaro_print_qr_enabled')) !== 'false';
    const qrAmount = (paymentMethod === 'split' && upiAmount != null && upiAmount > 0) ? upiAmount : total;
    if (printQrEnabled && user.upiId && qrAmount > 0) {
      const upiLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${qrAmount.toFixed(2)}&cu=INR`;
      builder
        .divider('-')
        .alignCenter()
        .bold(true)
        .line('SCAN TO PAY')
        .bold(false)
        .rasterQrCode(upiLink);
    }

    // Footer
    builder
      .alignCenter()
      .line('Thanks & Visit Again!')
      .line('Powered by BillKaro')
      .feed(printQrEnabled ? 3 : 2); // Reduced feed when QR is disabled to save maximum paper roll

    await sendEscPosBytes(builder.getBytes());
    return { success: true };
  } catch (err: any) {
    console.error('Direct Bluetooth print error:', err);
    return { success: false, error: err.message || 'Failed to print over Bluetooth.' };
  }
}
