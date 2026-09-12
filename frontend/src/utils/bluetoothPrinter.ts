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

  // High-Resolution 1-bit Monochrome Raster Header for Store Name
  // Prints crystal clear like the QR code, eliminating printer ROM font blur & firmware splitting lines
  rasterStoreHeader(storeName: string): this {
    try {
      if (typeof document === 'undefined') {
        this.alignCenter().bold(true).line(storeName).bold(false);
        return this;
      }

      const cleanName = storeName.trim().toUpperCase();
      if (!cleanName) return this;

      const paperWidth = (typeof localStorage !== 'undefined' ? localStorage.getItem('billkaro_printer_paper_width') : null) || '58mm';
      const maxDots = paperWidth === '80mm' ? 576 : 384;
      const maxPrintWidth = maxDots - 24; // 12-dot padding on each side

      const testCanvas = document.createElement('canvas');
      const testCtx = testCanvas.getContext('2d');
      if (!testCtx) {
        this.alignCenter().bold(true).line(cleanName).bold(false);
        return this;
      }

      let fontSize = 28;
      testCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
      let textWidth = testCtx.measureText(cleanName).width;

      let lines: string[] = [];
      if (textWidth <= maxPrintWidth) {
        lines = [cleanName];
      } else {
        testCtx.font = `bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
        if (testCtx.measureText(cleanName).width <= maxPrintWidth) {
          fontSize = 24;
          lines = [cleanName];
        } else {
          fontSize = 24;
          const words = cleanName.split(' ');
          let l1 = '';
          let l2 = '';
          for (const w of words) {
            const testL1 = (l1 ? l1 + ' ' : '') + w;
            testCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
            if (testCtx.measureText(testL1).width <= maxPrintWidth && !l2) {
              l1 = testL1;
            } else {
              l2 = (l2 ? l2 + ' ' : '') + w;
            }
          }
          lines = l2 ? [l1, l2] : [cleanName];
        }
      }

      const canvasHeight = lines.length === 1 ? 44 : 76;
      const canvas = document.createElement('canvas');
      canvas.width = maxDots;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        this.alignCenter().bold(true).line(cleanName).bold(false);
        return this;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maxDots, canvasHeight);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

      if (lines.length === 1) {
        ctx.fillText(lines[0], maxDots / 2, Math.floor(canvasHeight / 2));
      } else {
        ctx.fillText(lines[0], maxDots / 2, Math.floor(canvasHeight * 0.3));
        ctx.fillText(lines[1], maxDots / 2, Math.floor(canvasHeight * 0.74));
      }

      const imgData = ctx.getImageData(0, 0, maxDots, canvasHeight);
      const pixels = imgData.data;

      let yMin = -1;
      let yMax = -1;
      for (let y = 0; y < canvasHeight; y++) {
        let hasBlack = false;
        for (let x = 0; x < maxDots; x++) {
          const idx = (y * maxDots + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const a = pixels[idx + 3];
          if (a > 100 && (r * 0.299 + g * 0.587 + b * 0.114) < 160) {
            hasBlack = true;
            break;
          }
        }
        if (hasBlack) {
          if (yMin === -1) yMin = y;
          yMax = y;
        }
      }

      if (yMin === -1 || yMax === -1) {
        this.alignCenter().bold(true).line(cleanName).bold(false);
        return this;
      }

      const startY = Math.max(0, yMin - 1);
      const endY = Math.min(canvasHeight - 1, yMax + 1);
      const actualHeight = endY - startY + 1;
      const bytesPerLine = Math.floor(maxDots / 8);

      this.alignLeft();
      this.buffer.push(0x1d, 0x76, 0x30, 0x00);
      this.buffer.push(bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff);
      this.buffer.push(actualHeight & 0xff, (actualHeight >> 8) & 0xff);

      for (let y = startY; y <= endY; y++) {
        for (let xByte = 0; xByte < bytesPerLine; xByte++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const xDot = xByte * 8 + bit;
            const idx = (y * maxDots + xDot) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const a = pixels[idx + 3];
            const isBlack = a > 100 && (r * 0.299 + g * 0.587 + b * 0.114) < 160;
            if (isBlack) {
              byteVal |= (1 << (7 - bit));
            }
          }
          this.buffer.push(byteVal);
        }
      }

      this.alignCenter();
    } catch (err) {
      console.warn('Failed to rasterize store header, falling back to text:', err);
      this.alignCenter().bold(true).line(storeName).bold(false);
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
  customerName?: string;
  customerPhone?: string;
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

  const { bill, user, items, subtotal, tax, total, discountAmount, discountValue, discountType, paymentMethod, upiAmount, invoiceNumber, customerName } = params;

  try {
    const builder = new EscPosBuilder();

    // 1. Crystal-Clear Raster Store Header (No feed, no ROM blur, no horizontal splitting line, zero wasted paper)
    const storeName = (user.storeName || 'RESTAURANT').trim().toUpperCase();
    builder.rasterStoreHeader(storeName);

    builder
      .alignCenter()
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

    // Customer Name & Udhaar credit details
    const cust = (customerName || '').trim();
    if (cust) {
      builder.twoCol('Customer:', cust.slice(0, 20));
    }
    if (paymentMethod === 'udhaar') {
      builder.twoCol('Payment Mode:', 'UDHAAR (CREDIT)');
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
      .twoCol('TOTAL:', `Rs ${total.toFixed(2)}`)
      .bold(false);

    // Dynamic UPI QR code:
    // When paying via Cash or Udhaar: DO NOT print QR code to save paper!
    // When Split payment: print QR with the exact split UPI amount!
    // When UPI / default: print QR with total bill amount.
    const printQrEnabled = (typeof window !== 'undefined' && localStorage.getItem('billkaro_print_qr_enabled')) !== 'false';
    const isCashOnly = paymentMethod === 'cash';
    const isUdhaar = paymentMethod === 'udhaar';
    const hasUpiPay = (paymentMethod === 'split') ? (upiAmount != null && upiAmount > 0) : (!isCashOnly && !isUdhaar);
    const qrAmount = (paymentMethod === 'split' && upiAmount != null && upiAmount > 0) ? upiAmount : total;

    const shouldPrintQr = printQrEnabled && Boolean(user.upiId) && hasUpiPay && qrAmount > 0;
    if (shouldPrintQr) {
      const upiLink = `upi://pay?pa=${encodeURIComponent(user.upiId!)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${qrAmount.toFixed(2)}&cu=INR`;
      builder
        .divider('-')
        .alignCenter()
        .bold(true)
        .line(paymentMethod === 'split' ? `SCAN TO PAY (UPI: Rs ${qrAmount.toFixed(2)})` : 'SCAN TO PAY')
        .bold(false)
        .rasterQrCode(upiLink);
    }

    // Footer
    builder
      .alignCenter()
      .line('Thanks & Visit Again!')
      .line('Powered by BillKaro')
      .feed(shouldPrintQr ? 3 : 2); // Reduced feed when QR is suppressed to save maximum paper roll

    await sendEscPosBytes(builder.getBytes());
    return { success: true };
  } catch (err: any) {
    console.error('Direct Bluetooth print error:', err);
    return { success: false, error: err.message || 'Failed to print over Bluetooth.' };
  }
}
