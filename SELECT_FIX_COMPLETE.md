# Radix UI Select Error - Fixed ✅

## Issue
Radix UI error: `"A <Select.Item /> must have a value prop that is not an empty string."`

## Root Cause
In `apps/web/src/app/page.tsx` (line 133), the Category filter had:
```tsx
<SelectItem value="">All</SelectItem>
```

Radix UI doesn't allow empty string values for `<SelectItem>`.

## Solution Applied

### 1. Changed SelectItem Value
**Before:**
```tsx
<SelectItem value="">All</SelectItem>
```

**After:**
```tsx
<SelectItem value="all">All</SelectItem>
```

### 2. Updated State Initialization
**Before:**
```tsx
const [category, setCategory] = useState<string>('');
```

**After:**
```tsx
const [category, setCategory] = useState<string>('all');
```

### 3. Updated Filter Logic
**Before:**
```tsx
if (category) {
  filterParams.category = category;
}
```

**After:**
```tsx
if (category && category !== 'all') {
  filterParams.category = category;
}
```

### 4. Updated Reset Button
**Before:**
```tsx
onClick={() => {
  setDateRange('24h');
  setMinIrs(75);
  setCategory('');
}}
```

**After:**
```tsx
onClick={() => {
  setDateRange('24h');
  setMinIrs(75);
  setCategory('all');
}}
```

## Verification

All Select components in the app now have valid non-empty values:

### ✅ Dashboard (`apps/web/src/app/page.tsx`)
- **Date Range**: `"24h"`, `"7d"`, `"30d"` ✅
- **Category**: `"all"`, `"Crypto"`, `"AI"`, `"Economics"`, `"Technology"` ✅

### ✅ Backtest (`apps/web/src/app/backtest/page.tsx`)
- **Weight Preset**: `"default"`, `"strict"`, `"balanced"`, `"lenient"` ✅

### ✅ Settings (`apps/web/src/app/settings/page.tsx`)
- No Select components (uses Sliders and Buttons only) ✅

## Testing

Run the development server:
```bash
cd apps/web
pnpm dev
```

### Expected Results
- ✅ No Radix UI warnings or errors in console
- ✅ Category filter shows "All" by default
- ✅ Selecting "All" shows all categories (no category filter applied)
- ✅ Selecting specific categories filters correctly
- ✅ Reset button resets category to "All"

## Best Practices for Future Select Components

When using Radix UI Select:

1. **Always use non-empty string values:**
   ```tsx
   ✅ <SelectItem value="all">All</SelectItem>
   ❌ <SelectItem value="">All</SelectItem>
   ```

2. **Handle "all" or "none" selection in logic:**
   ```tsx
   if (value && value !== 'all') {
     // Apply filter
   }
   ```

3. **Set appropriate default values:**
   ```tsx
   const [filter, setFilter] = useState('all'); // ✅
   const [filter, setFilter] = useState('');    // ❌
   ```

4. **Use type-safe values:**
   ```tsx
   type FilterValue = 'all' | 'crypto' | 'ai' | 'economics';
   const [filter, setFilter] = useState<FilterValue>('all');
   ```

## Files Modified
- `apps/web/src/app/page.tsx` (4 changes)

## Status
🎉 **RESOLVED** - No more Radix UI Select errors!

