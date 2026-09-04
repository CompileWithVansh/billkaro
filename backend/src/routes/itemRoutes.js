import express from 'express';
import { itemsRepo } from '../db.js';
import { requireAuth } from '../auth.js';
import { sanitizeText } from '../utils/sanitize.js';

const router = express.Router();
router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function mapItem(r) {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    color: r.color,
    category: r.category,
    description: r.description || '',
    stockQuantity: r.stock_quantity !== undefined && r.stock_quantity !== null ? Number(r.stock_quantity) : null,
    sortOrder: r.sort_order,
  };
}

function parseAndValidateItem(body) {
  const { name, price, color, category, description, stockQuantity } = body || {};
  const cleanName = sanitizeText(name);
  if (!cleanName || cleanName.length > 100) {
    return { error: 'Item name must be between 1 and 100 characters' };
  }
  const numPrice = typeof price === 'number' ? price : Number(price);
  if (isNaN(numPrice) || numPrice < 0 || numPrice > 999999) {
    return { error: 'Price must be a valid number between 0 and 999,999' };
  }
  const cleanCategory = sanitizeText(category);
  if (cleanCategory.length > 50) {
    return { error: 'Category must be under 50 characters' };
  }
  const cleanDescription = sanitizeText(description, { allowNewlines: true });
  if (cleanDescription.length > 500) {
    return { error: 'Description must be under 500 characters' };
  }
  const cleanColor = sanitizeText(color);
  if (cleanColor.length > 20) {
    return { error: 'Color must be under 20 characters' };
  }
  let cleanStock = null;
  if (stockQuantity !== null && stockQuantity !== undefined && stockQuantity !== '') {
    const s = Number(stockQuantity);
    if (!Number.isInteger(s) || s < 0 || s > 999999) {
      return { error: 'Stock quantity must be an integer between 0 and 999,999' };
    }
    cleanStock = s;
  }
  return {
    value: {
      name: cleanName,
      price: numPrice,
      color: cleanColor || '#4f46e5',
      category: cleanCategory,
      description: cleanDescription,
      stockQuantity: cleanStock,
    },
  };
}

// GET /api/items
router.get(
  '/',
  wrap(async (req, res) => {
    const items = await itemsRepo.listByUser(req.userId);
    res.json({ items: items.map(mapItem) });
  })
);

// POST /api/items
router.post(
  '/',
  wrap(async (req, res) => {
    const { error, value } = parseAndValidateItem(req.body);
    if (error) return res.status(400).json({ error });

    const item = await itemsRepo.create(req.userId, value);
    res.status(201).json({ item: mapItem(item) });
  })
);

// PUT /api/items/layout/reorder
router.put(
  '/layout/reorder',
  wrap(async (req, res) => {
    const { order } = req.body || {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of item ids' });
    }
    const items = await itemsRepo.reorder(req.userId, order);
    res.json({ items: items.map(mapItem) });
  })
);

// PUT /api/items/:id
router.put(
  '/:id',
  wrap(async (req, res) => {
    const { error, value } = parseAndValidateItem(req.body);
    if (error) return res.status(400).json({ error });

    const item = await itemsRepo.update(req.params.id, req.userId, value);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: mapItem(item) });
  })
);

// DELETE /api/items/:id
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ok = await itemsRepo.remove(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  })
);

// POST /api/items/scan-menu (Gemini 3.6 Flash Vision Menu Scanner)
router.post(
  '/scan-menu',
  wrap(async (req, res) => {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Menu image data is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key is not configured on server' });
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const prompt = `You are an expert restaurant and cafe menu digitizer.
Carefully analyze this menu card image. Extract ALL dishes, drinks, and food items.
For every item, identify:
1. "name": The clean dish/item name (e.g. "Cold Coffee", "Veg Grilled Sandwich", "Kalimirch Chicken").
2. "category": The logical menu section (e.g. "Beverages", "Starters", "Main Course", "Breads", "Desserts", "Snacks").
3. "price": Numeric price in INR (e.g. 150, 90). If portion sizes are listed (e.g. Half 100 / Full 180), create separate items with the portion in the name like "Dal Makhani (Half)" 100 and "Dal Makhani (Full)" 180.
4. "description": Portion size, ingredients, or short details if present (e.g. "Quarter plate", "Serves 1", "With spicy chutney").

Return strictly a JSON array of objects with no markdown code fences or other text:
[
  { "name": "Item Name", "category": "Category", "price": 100, "description": "Details" }
]`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini Menu Scan Error:', errBody);
      return res.status(502).json({ error: 'AI menu scan failed. Please verify the image is clear and try again.' });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'No menu items could be identified from this image.' });
    }

    let parsedItems = [];
    try {
      parsedItems = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) parsedItems = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsedItems)) {
      return res.status(500).json({ error: 'Invalid response format from AI scanner' });
    }

    // Assign harmonious category colors
    const palette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0891b2', '#e11d48', '#059669'];
    const catColorMap = new Map();
    let colIdx = 0;

    const validated = parsedItems
      .filter((i) => i && i.name && typeof i.name === 'string')
      .map((i) => {
        const cat = (i.category || 'General').trim();
        if (!catColorMap.has(cat.toLowerCase())) {
          catColorMap.set(cat.toLowerCase(), palette[colIdx % palette.length]);
          colIdx++;
        }
        return {
          name: i.name.trim(),
          category: cat,
          price: Math.max(0, Number(i.price) || 0),
          description: (i.description || '').trim(),
          color: catColorMap.get(cat.toLowerCase()),
        };
      });

    res.json({ items: validated });
  })
);

// POST /api/items/bulk (Batch import confirmed items)
router.post(
  '/bulk',
  wrap(async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const createdItems = [];
    for (const item of items) {
      if (!item.name) continue;
      const created = await itemsRepo.create(req.userId, {
        name: item.name.trim(),
        price: Number(item.price) || 0,
        color: item.color || '#2563eb',
        category: (item.category || 'General').trim(),
        description: (item.description || '').trim(),
        stockQuantity: item.stockQuantity !== undefined && item.stockQuantity !== null ? Number(item.stockQuantity) : null,
      });
      createdItems.push(created);
    }

    res.status(201).json({ count: createdItems.length, items: createdItems.map(mapItem) });
  })
);

export default router;
