import { useState, useRef, ChangeEvent } from 'react';
import { api } from '../api';
import { ITEM_COLORS } from '../colors';

export interface ScannedMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  color: string;
  selected: boolean;
}

interface MenuScannerModalProps {
  onClose: () => void;
  onImportSuccess: () => void;
}

const CATEGORY_PALETTE = ITEM_COLORS;

const AI_MENU_PROMPT = `You are an expert restaurant and cafe menu digitizer for the BillKaro POS billing system.
Analyze the provided menu card (from this image or text). Extract all food items, beverages, and dishes, grouped logically into menu categories. Each category will automatically become a menu tab in the BillKaro POS app.

Return ONLY a valid JSON array of objects with the exact schema below (strictly no markdown preamble or conversational text, output only the JSON array):

[
  {
    "name": "Paneer Butter Masala",
    "category": "Main Course",
    "price": 240,
    "description": "Rich tomato butter gravy (Serves 2)",
    "color": "#16a34a"
  },
  {
    "name": "Cold Coffee with Ice Cream",
    "category": "Beverages",
    "price": 110,
    "description": "Chilled chocolate blend 250ml",
    "color": "#2563eb"
  },
  {
    "name": "Margherita Pizza (Regular)",
    "category": "Pizza",
    "price": 180,
    "description": "Fresh mozzarella, tomato basil sauce",
    "color": "#d97706"
  }
]

RULES FOR ACCURATE BILLKARO POS FORMAT:
1. "name": Clean item/dish name (max 60 characters). If portion sizes or variants are listed (e.g. Half / Full, Regular / Large), create separate items with the portion in the name like "Dal Makhani (Half)" and "Dal Makhani (Full)".
2. "category": The logical menu section/tab name (e.g. "Beverages", "Starters", "Main Course", "Breads", "Pizza", "Burgers", "Chinese", "Desserts"). All items sharing this category will appear inside that category tab in the POS.
3. "price": Numeric price in INR (e.g. 150, not "Rs 150" or "₹150"). Must be a pure number.
4. "description": Portion size, ingredients, spice level, or veg/non-veg tag if present (keep concise, under 100 characters).
5. "color": Optional hex color code matching the category.`;

const SAMPLE_MENU_JSON = `[
  {
    "name": "Paneer Butter Masala",
    "category": "Main Course",
    "price": 240,
    "description": "Rich tomato butter gravy (Serves 2)",
    "color": "#16a34a"
  },
  {
    "name": "Dal Makhani",
    "category": "Main Course",
    "price": 190,
    "description": "Slow cooked black lentils with cream",
    "color": "#16a34a"
  },
  {
    "name": "Butter Naan",
    "category": "Breads",
    "price": 45,
    "description": "Crispy clay-oven baked bread",
    "color": "#d97706"
  },
  {
    "name": "Cold Coffee with Ice Cream",
    "category": "Beverages",
    "price": 110,
    "description": "Chilled chocolate blend with vanilla scoop",
    "color": "#2563eb"
  },
  {
    "name": "Crispy Veg Spring Rolls",
    "category": "Starters",
    "price": 150,
    "description": "Served with sweet chili dip (6 pcs)",
    "color": "#ea580c"
  },
  {
    "name": "Gulab Jamun (2 Pcs)",
    "category": "Desserts",
    "price": 70,
    "description": "Warm milk dumplings in rose cardamom syrup",
    "color": "#9333ea"
  }
]`;

export function MenuScannerModal({ onClose, onImportSuccess }: MenuScannerModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [inputTab, setInputTab] = useState<'scan' | 'prompt'>('scan');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Prompt & JSON Paste state
  const [jsonInput, setJsonInput] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      processMenuScan(base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async function processMenuScan(base64Image: string, mimeType: string) {
    setStep('scanning');
    setError(null);

    try {
      const res = await api.post('/items/scan-menu', {
        imageBase64: base64Image,
        mimeType: mimeType || 'image/jpeg',
      });

      const items: Array<{ name: string; category: string; price: number; description?: string; color?: string }> =
        res.data?.items || [];

      if (items.length === 0) {
        setError('No items could be recognized in this menu image. Please try another clearer photo or use the "AI Prompt & Paste JSON" tab.');
        setStep('upload');
        return;
      }

      const formatted: ScannedMenuItem[] = items.map((item, idx) => ({
        id: `scanned_${Date.now()}_${idx}`,
        name: item.name,
        category: item.category || 'General',
        price: Number(item.price) || 0,
        description: item.description || '',
        color: item.color || '#2563eb',
        selected: true,
      }));

      setScannedItems(formatted);
      setSelectedCategory('All');
      setStep('review');
    } catch (err: any) {
      console.error('Menu scan error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to analyze menu image.';
      setError(`${errMsg} Tip: Try using the "AI Prompt & Paste JSON" tab above for 100% reliable import.`);
      setStep('upload');
    }
  }

  function handleCopyPrompt() {
    try {
      navigator.clipboard.writeText(AI_MENU_PROMPT);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJsonInput(text);
        setError(null);
      }
    } catch (err) {
      setError('Could not access clipboard directly. Please press Ctrl+V to paste into the text box.');
    }
  }

  function handleLoadSample() {
    setJsonInput(SAMPLE_MENU_JSON);
    setError(null);
  }

  function handleParseJson() {
    setError(null);
    const text = jsonInput.trim();
    if (!text) {
      setError('Please paste the AI generated JSON text into the box above.');
      return;
    }

    try {
      // Remove markdown code fences like ```json ... ``` or ``` ... ```
      let cleaned = text.replace(/^```[a-zA-Z]*\s*/i, '').replace(/\s*```$/i, '').trim();

      // If wrapped in extra text, attempt extracting array [ ... ] or object { ... }
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err1) {
        const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          parsed = JSON.parse(arrayMatch[0]);
        } else {
          const objMatch = cleaned.match(/\{[\s\S]*\}/);
          if (objMatch) {
            parsed = JSON.parse(objMatch[0]);
          } else {
            throw err1;
          }
        }
      }

      // Extract items array from parsed data
      let rawItems: any[] = [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.items)) rawItems = parsed.items;
        else if (Array.isArray(parsed.menu)) rawItems = parsed.menu;
        else if (Array.isArray(parsed.products)) rawItems = parsed.products;
        else if (Array.isArray(parsed.categories)) {
          // Format: [{ category: "Beverages", items: [...] }]
          rawItems = parsed.categories.flatMap((c: any) =>
            Array.isArray(c.items)
              ? c.items.map((i: any) => ({ ...i, category: c.category || c.name || i.category }))
              : []
          );
        } else {
          const arrVal = Object.values(parsed).find((v) => Array.isArray(v));
          if (arrVal && Array.isArray(arrVal)) {
            rawItems = arrVal;
          }
        }
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        setError('Could not find a valid menu items list in the provided JSON. Make sure it contains an array of items.');
        return;
      }

      // Assign harmonious palette colors to categories
      const catColorMap = new Map<string, string>();
      let colIdx = 0;

      const formatted: ScannedMenuItem[] = [];
      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i];
        if (!item || typeof item !== 'object') continue;

        const name = String(item.name || item.itemName || item.title || '').trim();
        if (!name) continue;

        const cat = String(item.category || item.section || item.group || 'General').trim() || 'General';
        if (!catColorMap.has(cat.toLowerCase())) {
          catColorMap.set(cat.toLowerCase(), CATEGORY_PALETTE[colIdx % CATEGORY_PALETTE.length]);
          colIdx++;
        }

        const rawPrice = item.price !== undefined ? item.price : (item.cost ?? item.rate ?? 0);
        const priceNum = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice).replace(/[^\d.]/g, '')) || 0;

        formatted.push({
          id: `pasted_${Date.now()}_${i}`,
          name,
          category: cat,
          price: Math.max(0, priceNum),
          description: String(item.description || item.desc || item.portion || '').trim(),
          color: item.color || catColorMap.get(cat.toLowerCase()) || '#2563eb',
          selected: true,
        });
      }

      if (formatted.length === 0) {
        setError('No valid menu items with a "name" property were found in the JSON.');
        return;
      }

      setScannedItems(formatted);
      setSelectedCategory('All');
      setStep('review');
    } catch (e: any) {
      console.error('JSON parse error:', e);
      setError('Invalid JSON format. Please verify the copied text is valid JSON or click "Load Sample Menu" to see the expected format.');
    }
  }

  function toggleItemSelection(id: string) {
    setScannedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  }

  function updateItemField(id: string, field: 'name' | 'category' | 'price' | 'description', value: any) {
    setScannedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  }

  function removeItem(id: string) {
    setScannedItems((prev) => prev.filter((i) => i.id !== id));
  }

  function selectAll(val: boolean) {
    setScannedItems((prev) => prev.map((i) => ({ ...i, selected: val })));
  }

  function addNewRow() {
    const newItem: ScannedMenuItem = {
      id: `scanned_${Date.now()}`,
      name: '',
      category: selectedCategory === 'All' ? 'General' : selectedCategory,
      price: 0,
      description: '',
      color: '#2563eb',
      selected: true,
    };
    setScannedItems((prev) => [newItem, ...prev]);
  }

  async function handleImport() {
    const selected = scannedItems.filter((i) => i.selected && i.name.trim());
    if (selected.length === 0) {
      setError('Please select at least one item with a valid name to import.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      // Chunk into batches of 90 items to respect backend bulk limits safely
      const BATCH_SIZE = 90;
      for (let i = 0; i < selected.length; i += BATCH_SIZE) {
        const batch = selected.slice(i, i + BATCH_SIZE);
        await api.post('/items/bulk', {
          items: batch.map((item) => ({
            name: item.name.trim(),
            category: item.category.trim(),
            price: Math.max(0, Number(item.price) || 0),
            description: item.description.trim(),
            color: item.color,
          })),
        });
      }

      onImportSuccess();
      onClose();
    } catch (err: any) {
      console.error('Bulk import error:', err);
      setError(err.response?.data?.error || 'Failed to import items into menu catalog.');
      setIsImporting(false);
    }
  }

  const categories = ['All', ...Array.from(new Set(scannedItems.map((i) => i.category.trim())))];
  const displayedItems =
    selectedCategory === 'All'
      ? scannedItems
      : scannedItems.filter((i) => i.category.trim() === selectedCategory);

  const selectedCount = scannedItems.filter((i) => i.selected).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '820px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📷</span> AI Menu Digitizer & Scanner
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Photograph any paper menu card or paste AI-generated JSON — automatically generates dishes and menu tabs.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Sectional Tabs (Only shown in upload / input step) */}
        {step === 'upload' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '4px',
              background: 'var(--panel-2)',
              borderRadius: '12px',
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setInputTab('scan');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: 600,
                fontSize: '0.9rem',
                background: inputTab === 'scan' ? '#2563eb' : 'transparent',
                color: inputTab === 'scan' ? '#ffffff' : 'var(--muted)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>📸</span> Scan Photo / Camera
            </button>
            <button
              type="button"
              onClick={() => {
                setInputTab('prompt');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: 600,
                fontSize: '0.9rem',
                background: inputTab === 'prompt' ? '#2563eb' : 'transparent',
                color: inputTab === 'prompt' ? '#ffffff' : 'var(--muted)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>🤖</span> AI Prompt & Paste JSON
              <span
                style={{
                  fontSize: '0.72rem',
                  background: inputTab === 'prompt' ? 'rgba(255,255,255,0.22)' : 'rgba(34,197,94,0.15)',
                  color: inputTab === 'prompt' ? '#ffffff' : '#22c55e',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}
              >
                100% Reliable
              </span>
            </button>
          </div>
        )}

        {/* STEP 1: Upload / Input */}
        {step === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {/* TAB A: Camera / File Scan */}
            {inputTab === 'scan' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '16px',
                    padding: '36px 20px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: 12 }}>📋</div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Take or Upload a Photo of Your Menu</h4>
                  <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Supports physical paper menus, laminated cards, cafe chalkboards, or digital flyers.
                  </p>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn green"
                      style={{ minWidth: '170px', padding: '12px 18px', fontSize: '0.95rem' }}
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      📸 Take Photo (Camera)
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ minWidth: '170px', padding: '12px 18px', fontSize: '0.95rem' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📁 Browse Image / File
                    </button>
                  </div>

                  {/* Hidden file inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </div>

                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    fontSize: '0.85rem',
                    color: 'var(--muted)',
                    lineHeight: 1.4,
                  }}
                >
                  💡 <b>Tips for best camera results:</b>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>Ensure good lighting and avoid heavy shadows on the menu text.</li>
                    <li>Capture all prices and item names in clear focus.</li>
                    <li>If camera scanning fails due to complex fonts, switch to the <b>AI Prompt & Paste JSON</b> tab above.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB B: AI Prompt & Paste JSON */}
            {inputTab === 'prompt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Step 1: Copy AI Prompt */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>1️⃣</span> Copy Prompt for ChatGPT, Claude, or Gemini
                    </div>
                    <button
                      type="button"
                      className={`btn sm-btn ${copiedPrompt ? 'green' : 'ghost'}`}
                      onClick={handleCopyPrompt}
                      style={{
                        fontSize: '0.8rem',
                        padding: '5px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontWeight: 600,
                      }}
                    >
                      {copiedPrompt ? '✅ Copied to Clipboard!' : '📋 Copy Prompt'}
                    </button>
                  </div>
                  <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                    Paste this prompt into ChatGPT, Gemini, or Claude along with your menu photo or text. It formats items and category tabs specifically for BillKaro POS.
                  </p>

                  <div
                    style={{
                      maxHeight: '85px',
                      overflowY: 'auto',
                      background: '#090d16',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '0.74rem',
                      fontFamily: 'monospace',
                      color: '#38bdf8',
                      whiteSpace: 'pre-wrap',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                    }}
                  >
                    {AI_MENU_PROMPT}
                  </div>
                </div>

                {/* Step 2: Paste Generated JSON */}
                <div
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>2️⃣</span> Paste Generated Menu JSON
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn ghost sm-btn"
                        onClick={handlePasteFromClipboard}
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        title="Paste from your clipboard"
                      >
                        📋 Paste
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm-btn"
                        onClick={handleLoadSample}
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        title="Load an example menu JSON to test"
                      >
                        💡 Load Sample
                      </button>
                      {jsonInput && (
                        <button
                          type="button"
                          className="btn ghost sm-btn"
                          onClick={() => setJsonInput('')}
                          style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#ef4444' }}
                          title="Clear text box"
                        >
                          🗑️ Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder={`Paste the AI generated JSON here (e.g. [ { "name": "Cold Coffee", "category": "Beverages", "price": 90 } ])...`}
                    rows={6}
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '10px',
                      color: '#f1f5f9',
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />

                  <button
                    type="button"
                    className="btn green"
                    onClick={handleParseJson}
                    style={{
                      padding: '10px 16px',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span>✨</span> Parse & Load Menu Items →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Scanning & Processing State */}
        {step === 'scanning' && (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 20px' }}>
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Menu Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16, opacity: 0.6 }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--panel-2)',
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                  }}
                >
                  📄
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '3px solid #38bdf8',
                  borderRadius: 16,
                  animation: 'pulse 1.5s infinite',
                }}
              />
            </div>

            <h4 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: '#38bdf8' }}>
              🧠 Gemini AI is Scanning Your Menu...
            </h4>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Detecting dishes, drinks, categories, prices, and portion sizes. Usually takes 2–3 seconds.
            </p>
          </div>
        )}

        {/* STEP 3: Review & Edit Items */}
        {step === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Stats bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--panel-2)',
                padding: '10px 14px',
                borderRadius: 12,
                marginBottom: 10,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                ✨ Found <strong>{scannedItems.length} items</strong> across {categories.length - 1} categories
                <span style={{ marginLeft: 8, color: '#22c55e' }}>({selectedCount} selected)</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn ghost sm-btn"
                  onClick={() => selectAll(true)}
                  style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn ghost sm-btn"
                  onClick={() => selectAll(false)}
                  style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  className="btn ghost sm-btn"
                  onClick={addNewRow}
                  style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                >
                  ➕ Add Row
                </button>
              </div>
            </div>

            {/* Category filter tabs */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 8,
                marginBottom: 10,
                scrollbarWidth: 'none',
              }}
            >
              {categories.map((cat) => {
                const count =
                  cat === 'All'
                    ? scannedItems.length
                    : scannedItems.filter((i) => i.category.trim() === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`btn sm-btn ${selectedCategory === cat ? 'primary' : 'ghost'}`}
                    onClick={() => setSelectedCategory(cat)}
                    style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '4px 10px', borderRadius: 20 }}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {/* Editable Items List / Table */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--bg)',
                padding: '4px 8px',
                minHeight: '220px',
                maxHeight: '45vh',
              }}
            >
              <div style={{ minWidth: '560px', display: 'flex', flexDirection: 'column' }}>
                {/* Table Column Headers */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 6px 8px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#94a3b8',
                  }}
                >
                  <span style={{ width: 18, flexShrink: 0 }} />
                  <span style={{ flex: '2 1 140px', minWidth: '130px' }}>Item Name</span>
                  <span style={{ flex: '1.2 1 95px', minWidth: '90px' }}>Category</span>
                  <span style={{ flex: '0 0 95px', minWidth: '95px' }}>Price (₹)</span>
                  <span style={{ flex: '1.5 1 120px', minWidth: '100px' }}>Portion / Desc</span>
                  <span style={{ width: 28, flexShrink: 0 }} />
                </div>

                {displayedItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 6px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      opacity: item.selected ? 1 : 0.45,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItemSelection(item.id)}
                      style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                    />

                    {/* Name */}
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                      placeholder="Item Name"
                      style={{
                        flex: '2 1 140px',
                        minWidth: '130px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    />

                    {/* Category */}
                    <input
                      type="text"
                      value={item.category}
                      onChange={(e) => updateItemField(item.id, 'category', e.target.value)}
                      placeholder="Category"
                      style={{
                        flex: '1.2 1 95px',
                        minWidth: '90px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#94a3b8',
                        fontSize: '0.85rem',
                      }}
                    />

                    {/* Price */}
                    <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 95px', minWidth: '95px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, color: '#94a3b8', fontSize: '0.85rem', pointerEvents: 'none' }}>₹</span>
                      <input
                        type="number"
                        className="clean-number"
                        value={item.price}
                        onChange={(e) => updateItemField(item.id, 'price', e.target.value)}
                        placeholder="0"
                        style={{
                          width: '100%',
                          minWidth: '95px',
                          boxSizing: 'border-box',
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '6px 6px 6px 20px',
                          color: '#22c55e',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                        }}
                      />
                    </div>

                    {/* Description */}
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItemField(item.id, 'description', e.target.value)}
                      placeholder="Desc / Portion"
                      style={{
                        flex: '1.5 1 120px',
                        minWidth: '100px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#94a3b8',
                        fontSize: '0.82rem',
                      }}
                    />

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        fontSize: '1rem',
                        flexShrink: 0,
                      }}
                      title="Remove item"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setStep('upload');
                }}
                disabled={isImporting}
                style={{ flex: 1 }}
              >
                ← Back / Edit Source
              </button>
              <button
                type="button"
                className="btn green"
                onClick={handleImport}
                disabled={isImporting || selectedCount === 0}
                style={{ flex: 2, fontSize: '1rem', fontWeight: 700 }}
              >
                {isImporting ? '⏳ Importing...' : `✅ Import ${selectedCount} Items to Menu`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
