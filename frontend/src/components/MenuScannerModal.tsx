import { useState, useRef, ChangeEvent } from 'react';
import { api } from '../api';

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

export function MenuScannerModal({ onClose, onImportSuccess }: MenuScannerModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError('No items could be recognized in this menu image. Please try another clearer photo.');
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
      setStep('review');
    } catch (err: any) {
      console.error('Menu scan error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to analyze menu image.';
      setError(errMsg);
      setStep('upload');
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
      await api.post('/items/bulk', {
        items: selected.map((i) => ({
          name: i.name.trim(),
          category: i.category.trim(),
          price: Math.max(0, Number(i.price) || 0),
          description: i.description.trim(),
          color: i.color,
        })),
      });

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
        style={{ maxWidth: '780px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📷</span> AI Menu Card Scanner
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Photograph any paper menu card or booklet — Gemini AI extracts all items, categories & prices instantly.
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

        {/* STEP 1: Upload / Camera Snap */}
        {step === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
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
              💡 <b>Tips for best results:</b>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>Ensure good lighting and avoid heavy shadows on the menu text.</li>
                <li>Capture all prices and item names in clear focus.</li>
                <li>You will have a full preview to review, edit, or adjust prices before saving.</li>
              </ul>
            </div>
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
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--bg)',
                padding: '4px 8px',
                minHeight: '220px',
                maxHeight: '45vh',
              }}
            >
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
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />

                  {/* Name */}
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                    placeholder="Item Name"
                    style={{
                      flex: 2,
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
                      flex: 1.2,
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      color: '#94a3b8',
                      fontSize: '0.85rem',
                    }}
                  />

                  {/* Price */}
                  <div style={{ display: 'flex', alignItems: 'center', flex: 0.9, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, color: '#94a3b8', fontSize: '0.85rem' }}>₹</span>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => updateItemField(item.id, 'price', e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 8px 6px 20px',
                        color: '#22c55e',
                        fontWeight: 700,
                        fontSize: '0.85rem',
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
                      flex: 1.5,
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
                    }}
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setStep('upload');
                  setScannedItems([]);
                }}
                disabled={isImporting}
                style={{ flex: 1 }}
              >
                🔄 Scan Another
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
