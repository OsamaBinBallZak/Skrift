# Dark Mode Implementation Plan

**Project:** Skrift - Voice Transcription Pipeline  
**Date:** 2025-10-26  
**Status:** Planning Phase  
**Overall Risk:** 🟡 Medium (manageable with careful implementation)

---

## Overview

This document outlines the complete plan to implement dark mode support in the Skrift Electron application through a centralized design token system. The implementation will be done in phases to ensure stability and maintainability.

**After thorough code analysis:** The infrastructure is mostly in place. We found several critical issues that need addressing, but overall the plan is sound and ready to execute.

---

## Current State Analysis

### Existing Infrastructure ✅
- **Tailwind CSS** configured with `darkMode: 'class'` ✅ Already perfect
- **CSS Variables** for dark mode already defined in `globals.css` ✅ Foundation exists
- **System preference detection** code already exists in App.tsx ✅ Just needs integration
- **Semantic color tokens** in `tailwind.config.js` (partial coverage) ⚠️ Needs expansion

### Current Issues ❌
- **Inconsistent color usage**: Mix of hardcoded Tailwind classes (`bg-blue-500`), semantic tokens (`bg-background-primary`), and CSS variables (`var(--color-text-primary)`)
- **No UI for theme switching**: No user-facing toggle or settings interface
- **Incomplete dark mode coverage**: Only some components have dark mode variants
- **No color documentation**: Developers can't easily see what semantic colors are available
- **Dead code**: `useThemeSafe` hook exists but is unused (needs removal)

---

## Critical Findings from Code Analysis 🔍

### Finding #1: Settings Tab Structure (HIGH PRIORITY)
**Location:** `/frontend/features/settings/components/SettingsTab.tsx:413-414`

**Current:**
```tsx
<Tabs defaultValue="paths" className="w-full">
  <TabsList className="grid w-full grid-cols-5">
```

**Issue:** Grid is correctly set to 5 columns, but default value is "paths". When we add "General" tab, it should be the default.

**Fix for Phase 1:**
- Keep `grid-cols-5` (correct)
- Change `defaultValue="paths"` to `defaultValue="general"`
- Reorder TabsTrigger elements (General first, Paths second)

---

### Finding #2: Names State Management (HIGH PRIORITY)
**Location:** `/frontend/features/settings/components/SettingsTab.tsx:73-257`

**Issue:** SettingsTab has 30+ state variables including complex names management state. Moving Names section to Sanitise tab requires careful state handling.

**Solution (Safest):**
Keep all Names state in parent SettingsTab component, render Names UI inside Sanitise TabsContent. Pass state/handlers as needed.

```tsx
// SettingsTab.tsx - Keep state here
const [people, setPeople] = useState<PersonEntry[]>([]);
const loadNames = async () => { /* existing */ };
const saveNames = async () => { /* existing */ };

// In render:
<TabsContent value="sanitise">
  <div className="space-y-6">
    {/* Names Section */}
    <section>
      <h3>Name Mappings</h3>
      {/* Inline render Names UI here, using state from parent */}
      {/* ... existing Names JSX from lines 523-587 ... */}
    </section>
    
    <Separator className="my-6" />
    
    {/* Existing Sanitise Settings */}
    <section>
      {/* ... existing sanitise config ... */}
    </section>
  </div>
</TabsContent>
```

---

### Finding #3: Color Token Approach Needs Adjustment (CRITICAL)

**Original Plan Issue:**
The plan suggested using class names like `bg-btn-primary-bg`, but Tailwind requires classes to be defined at build time. You can't dynamically generate class names.

**CORRECTED Approach (Hybrid Solution):**

**Step 1: Define tokens in Tailwind config**
```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Button tokens
        'btn-primary': 'rgb(var(--color-btn-primary) / <alpha-value>)',
        'btn-primary-hover': 'rgb(var(--color-btn-primary-hover) / <alpha-value>)',
        'btn-secondary': 'rgb(var(--color-btn-secondary) / <alpha-value>)',
        'btn-destructive': 'rgb(var(--color-btn-destructive) / <alpha-value>)',
        
        // Icon tokens
        'icon-primary': 'rgb(var(--color-icon-primary) / <alpha-value>)',
        'icon-secondary': 'rgb(var(--color-icon-secondary) / <alpha-value>)',
        
        // Add more semantic tokens...
      }
    }
  }
}
```

**Step 2: Define CSS variables for light/dark**
```css
/* globals.css */
:root {
  /* Buttons */
  --color-btn-primary: 59 130 246;        /* blue-600 */
  --color-btn-primary-hover: 37 99 235;   /* blue-700 */
  --color-btn-secondary: 100 116 139;     /* slate-600 */
  --color-btn-destructive: 239 68 68;     /* red-500 */
  
  /* Icons */
  --color-icon-primary: 59 130 246;       /* blue-600 */
  --color-icon-secondary: 100 116 139;    /* slate-600 */
}

.dark {
  /* Buttons - lighter in dark mode */
  --color-btn-primary: 96 165 250;        /* blue-400 */
  --color-btn-primary-hover: 59 130 246;  /* blue-600 */
  --color-btn-secondary: 148 163 184;     /* slate-400 */
  --color-btn-destructive: 248 113 113;   /* red-400 */
  
  /* Icons */
  --color-icon-primary: 96 165 250;       /* blue-400 */
  --color-icon-secondary: 148 163 184;    /* slate-400 */
}
```

**Step 3: Use in components**
```tsx
// CORRECT usage:
<Button className="bg-btn-primary hover:bg-btn-primary-hover text-white">
  Save
</Button>

<HardDrive className="w-5 h-5 text-icon-primary" />
```

**Why this works:**
- Tailwind generates classes at build time: `bg-btn-primary`, `hover:bg-btn-primary-hover`
- CSS variables provide the actual color values
- Switching `.dark` class on `<html>` swaps all colors instantly
- Can customize colors later by changing CSS variable values

---

### Finding #4: Dead Code Cleanup (MEDIUM PRIORITY)
**Location:** `/frontend/App.tsx:76-107`

**Issue:** A `useThemeSafe` hook already exists but is never used (dead code). Will conflict with our new ThemeContext.

**Fix:** Remove `useThemeSafe` function from App.tsx before implementing Phase 4 (Theme Toggle).

---

### Finding #5: Icon Color Inconsistency (MEDIUM PRIORITY)

**Issue:** Icons throughout the app have inconsistent color usage:
```tsx
<HardDrive className="w-5 h-5 text-blue-600" />  // Hardcoded blue
<Settings className="w-5 h-5" />                   // No color
<FolderInput className="w-4 h-4 text-green-600" /> // Hardcoded green
```

**Fix:** Create semantic icon color tokens (see corrected approach above) and standardize all icon usage.

---

## Goals

1. **Centralize all color definitions** into semantic design tokens ✅
2. **Create a visual reference** showing all available colors and their purposes ✅
3. **Refactor all components** to use semantic tokens consistently ✅
4. **Implement dark mode toggle** with light/dark/system preferences ✅
5. **Enable future customization** (foundation for user-configurable themes) ✅

---

## Implementation Phases

### Phase 1: Settings UI & Color Audit 📋

**UPDATED: Split into 1A and 1B for safety**

#### Phase 1A: Settings Tab Restructure (2 days)

**Goal:** Reorganize Settings tab without touching colors yet

**Tasks:**

1. **Update TabsList structure**
   ```tsx
   // BEFORE:
   <Tabs defaultValue="paths">
     <TabsList className="grid w-full grid-cols-5">
       <TabsTrigger value="paths">Paths</TabsTrigger>
       <TabsTrigger value="names">Names</TabsTrigger>
       <TabsTrigger value="sanitise">Sanitise</TabsTrigger>
       <TabsTrigger value="enhancement">Enhancement</TabsTrigger>
       <TabsTrigger value="export">Export</TabsTrigger>
     </TabsList>
   
   // AFTER:
   <Tabs defaultValue="general">
     <TabsList className="grid w-full grid-cols-5">
       <TabsTrigger value="general">General</TabsTrigger>
       <TabsTrigger value="paths">Paths</TabsTrigger>
       <TabsTrigger value="sanitise">Sanitise</TabsTrigger>
       <TabsTrigger value="enhancement">Enhancement</TabsTrigger>
       <TabsTrigger value="export">Export</TabsTrigger>
     </TabsList>
   ```

2. **Move Names content into Sanitise tab**
   - Extract Names JSX from lines 523-587 of SettingsTab.tsx
   - Move into Sanitise TabsContent
   - Keep all Names state in parent SettingsTab component
   - Add `<Separator />` between Names and Sanitise config sections

3. **Create General tab (placeholder)**
   ```tsx
   <TabsContent value="general">
     <div className="space-y-6">
       <section>
         <h3 className="text-lg font-medium">Appearance</h3>
         <p className="text-sm text-gray-600">
           Theme and color settings will be added here.
         </p>
       </section>
     </div>
   </TabsContent>
   ```

**Testing Checklist:**
- [ ] Can navigate to all 5 tabs
- [ ] General tab opens by default
- [ ] Names section works in Sanitise tab
- [ ] Can add/edit/delete person in Names
- [ ] Save Names button works
- [ ] Sanitise settings still functional
- [ ] No console errors
- [ ] No TypeScript errors

---

#### Phase 1B: Color System Foundation (2-3 days)

**Goal:** Establish semantic color tokens and create visual reference

**Tasks:**

1. **Color Audit**
   ```bash
   # Find all color usage
   grep -r "bg-[a-z]" frontend/features/settings --include="*.tsx"
   grep -r "text-[a-z]" frontend/features/settings --include="*.tsx"
   grep -r "border-[a-z]" frontend/features/settings --include="*.tsx"
   ```
   
   Document findings in color inventory table within this doc (see Appendix A).

2. **Define Semantic Tokens (Corrected Approach)**
   
   Update `tailwind.config.js`:
   ```javascript
   module.exports = {
     darkMode: 'class',
     theme: {
       extend: {
         colors: {
           // Buttons
           'btn-primary': 'rgb(var(--color-btn-primary) / <alpha-value>)',
           'btn-primary-hover': 'rgb(var(--color-btn-primary-hover) / <alpha-value>)',
           'btn-secondary': 'rgb(var(--color-btn-secondary) / <alpha-value>)',
           'btn-secondary-hover': 'rgb(var(--color-btn-secondary-hover) / <alpha-value>)',
           'btn-destructive': 'rgb(var(--color-btn-destructive) / <alpha-value>)',
           'btn-destructive-hover': 'rgb(var(--color-btn-destructive-hover) / <alpha-value>)',
           'btn-outline': 'rgb(var(--color-btn-outline) / <alpha-value>)',
           'btn-outline-hover': 'rgb(var(--color-btn-outline-hover) / <alpha-value>)',
           'btn-ghost-hover': 'rgb(var(--color-btn-ghost-hover) / <alpha-value>)',
           
           // Tabs
           'tab-active': 'rgb(var(--color-tab-active) / <alpha-value>)',
           'tab-active-text': 'rgb(var(--color-tab-active-text) / <alpha-value>)',
           'tab-inactive': 'rgb(var(--color-tab-inactive) / <alpha-value>)',
           'tab-inactive-text': 'rgb(var(--color-tab-inactive-text) / <alpha-value>)',
           'tab-hover': 'rgb(var(--color-tab-hover) / <alpha-value>)',
           
           // Status badges
           'status-exported': 'rgb(var(--color-status-exported) / <alpha-value>)',
           'status-exported-text': 'rgb(var(--color-status-exported-text) / <alpha-value>)',
           'status-enhanced': 'rgb(var(--color-status-enhanced) / <alpha-value>)',
           'status-enhanced-text': 'rgb(var(--color-status-enhanced-text) / <alpha-value>)',
           'status-sanitised': 'rgb(var(--color-status-sanitised) / <alpha-value>)',
           'status-sanitised-text': 'rgb(var(--color-status-sanitised-text) / <alpha-value>)',
           'status-transcribed': 'rgb(var(--color-status-transcribed) / <alpha-value>)',
           'status-transcribed-text': 'rgb(var(--color-status-transcribed-text) / <alpha-value>)',
           'status-processing': 'rgb(var(--color-status-processing) / <alpha-value>)',
           'status-processing-text': 'rgb(var(--color-status-processing-text) / <alpha-value>)',
           'status-error': 'rgb(var(--color-status-error) / <alpha-value>)',
           'status-error-text': 'rgb(var(--color-status-error-text) / <alpha-value>)',
           'status-unprocessed': 'rgb(var(--color-status-unprocessed) / <alpha-value>)',
           'status-unprocessed-text': 'rgb(var(--color-status-unprocessed-text) / <alpha-value>)',
           
           // Backgrounds
           'bg-app': 'rgb(var(--color-bg-app) / <alpha-value>)',
           'bg-card': 'rgb(var(--color-bg-card) / <alpha-value>)',
           'bg-secondary': 'rgb(var(--color-bg-secondary) / <alpha-value>)',
           'bg-tertiary': 'rgb(var(--color-bg-tertiary) / <alpha-value>)',
           'bg-input': 'rgb(var(--color-bg-input) / <alpha-value>)',
           
           // Text
           'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
           'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
           'text-tertiary': 'rgb(var(--color-text-tertiary) / <alpha-value>)',
           'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
           'text-inverse': 'rgb(var(--color-text-inverse) / <alpha-value>)',
           
           // Borders
           'border-default': 'rgb(var(--color-border-default) / <alpha-value>)',
           'border-secondary': 'rgb(var(--color-border-secondary) / <alpha-value>)',
           'border-focus': 'rgb(var(--color-border-focus) / <alpha-value>)',
           'border-error': 'rgb(var(--color-border-error) / <alpha-value>)',
           
           // Icons
           'icon-primary': 'rgb(var(--color-icon-primary) / <alpha-value>)',
           'icon-secondary': 'rgb(var(--color-icon-secondary) / <alpha-value>)',
           'icon-success': 'rgb(var(--color-icon-success) / <alpha-value>)',
           'icon-warning': 'rgb(var(--color-icon-warning) / <alpha-value>)',
           'icon-error': 'rgb(var(--color-icon-error) / <alpha-value>)',
           
           // Alerts
           'alert-info': 'rgb(var(--color-alert-info) / <alpha-value>)',
           'alert-info-text': 'rgb(var(--color-alert-info-text) / <alpha-value>)',
           'alert-success': 'rgb(var(--color-alert-success) / <alpha-value>)',
           'alert-success-text': 'rgb(var(--color-alert-success-text) / <alpha-value>)',
           'alert-warning': 'rgb(var(--color-alert-warning) / <alpha-value>)',
           'alert-warning-text': 'rgb(var(--color-alert-warning-text) / <alpha-value>)',
           'alert-error': 'rgb(var(--color-alert-error) / <alpha-value>)',
           'alert-error-text': 'rgb(var(--color-alert-error-text) / <alpha-value>)',
         }
       }
     }
   }
   ```

3. **Add CSS Variables (Light Mode)**
   
   Update `frontend/styles/globals.css` (add to existing `:root`):
   ```css
   :root {
     /* Buttons */
     --color-btn-primary: 59 130 246;           /* blue-600 */
     --color-btn-primary-hover: 37 99 235;      /* blue-700 */
     --color-btn-secondary: 100 116 139;        /* slate-600 */
     --color-btn-secondary-hover: 71 85 105;    /* slate-700 */
     --color-btn-destructive: 239 68 68;        /* red-500 */
     --color-btn-destructive-hover: 220 38 38;  /* red-600 */
     --color-btn-outline: transparent;
     --color-btn-outline-hover: 241 245 249;    /* slate-100 */
     --color-btn-ghost-hover: 241 245 249;      /* slate-100 */
     
     /* Tabs */
     --color-tab-active: 255 255 255;           /* white */
     --color-tab-active-text: 15 23 42;         /* slate-900 */
     --color-tab-inactive: 0 0 0;               /* transparent (use alpha) */
     --color-tab-inactive-text: 100 116 139;    /* slate-600 */
     --color-tab-hover: 248 250 252;            /* slate-50 */
     
     /* Status Badges */
     --color-status-exported: 220 252 231;      /* green-100 */
     --color-status-exported-text: 22 101 52;   /* green-800 */
     --color-status-enhanced: 243 232 255;      /* purple-100 */
     --color-status-enhanced-text: 124 58 237;  /* violet-600 */
     --color-status-sanitised: 219 234 254;     /* blue-100 */
     --color-status-sanitised-text: 30 64 175;  /* blue-800 */
     --color-status-transcribed: 224 231 255;   /* indigo-100 */
     --color-status-transcribed-text: 55 48 163;/* indigo-800 */
     --color-status-processing: 219 234 254;    /* blue-100 */
     --color-status-processing-text: 30 64 175; /* blue-800 */
     --color-status-error: 254 226 226;         /* red-100 */
     --color-status-error-text: 153 27 27;      /* red-800 */
     --color-status-unprocessed: 243 244 246;   /* gray-100 */
     --color-status-unprocessed-text: 55 65 81; /* gray-700 */
     
     /* Backgrounds */
     --color-bg-app: 249 250 251;               /* gray-50 */
     --color-bg-card: 255 255 255;              /* white */
     --color-bg-secondary: 249 250 251;         /* gray-50 */
     --color-bg-tertiary: 243 244 246;          /* gray-100 */
     --color-bg-input: 255 255 255;             /* white */
     
     /* Text */
     --color-text-primary: 15 23 42;            /* slate-900 */
     --color-text-secondary: 71 85 105;         /* slate-600 */
     --color-text-tertiary: 100 116 139;        /* slate-500 */
     --color-text-muted: 148 163 184;           /* slate-400 */
     --color-text-inverse: 255 255 255;         /* white */
     
     /* Borders */
     --color-border-default: 226 232 240;       /* slate-200 */
     --color-border-secondary: 203 213 225;     /* slate-300 */
     --color-border-focus: 59 130 246;          /* blue-600 */
     --color-border-error: 239 68 68;           /* red-500 */
     
     /* Icons */
     --color-icon-primary: 59 130 246;          /* blue-600 */
     --color-icon-secondary: 100 116 139;       /* slate-600 */
     --color-icon-success: 22 163 74;           /* green-600 */
     --color-icon-warning: 245 158 11;          /* orange-500 */
     --color-icon-error: 239 68 68;             /* red-500 */
     
     /* Alerts */
     --color-alert-info: 219 234 254;           /* blue-100 */
     --color-alert-info-text: 30 64 175;        /* blue-800 */
     --color-alert-success: 220 252 231;        /* green-100 */
     --color-alert-success-text: 22 101 52;     /* green-800 */
     --color-alert-warning: 254 243 199;        /* yellow-100 */
     --color-alert-warning-text: 146 64 14;     /* orange-800 */
     --color-alert-error: 254 226 226;          /* red-100 */
     --color-alert-error-text: 153 27 27;       /* red-800 */
   }
   ```

4. **Create ColorSwatch Component**
   
   New file: `/frontend/features/settings/components/ColorSwatch.tsx`
   ```tsx
   import React from 'react';
   
   interface ColorSwatchProps {
     name: string;
     token: string;
     usage: string;
     className: string; // e.g., "bg-btn-primary"
   }
   
   export function ColorSwatch({ name, token, usage, className }: ColorSwatchProps) {
     return (
       <div className="grid grid-cols-12 gap-4 items-center p-3 border border-border-default rounded">
         {/* Name & Token */}
         <div className="col-span-3">
           <div className="font-medium text-sm text-text-primary">{name}</div>
           <div className="text-xs text-text-muted font-mono">{token}</div>
         </div>
         
         {/* Light Mode Preview */}
         <div className="col-span-4">
           <div className="flex items-center gap-2">
             <div className={`w-12 h-12 rounded border border-border-default ${className}`} />
             <div className="text-xs text-text-secondary">Light Mode</div>
           </div>
         </div>
         
         {/* Dark Mode Preview (force dark class) */}
         <div className="col-span-4">
           <div className="flex items-center gap-2">
             <div className="dark">
               <div className={`w-12 h-12 rounded border border-border-default ${className}`} />
             </div>
             <div className="text-xs text-text-secondary">Dark Mode</div>
           </div>
         </div>
         
         {/* Usage */}
         <div className="col-span-1 flex justify-end">
           <div 
             className="text-xs text-text-tertiary" 
             title={usage}
           >
             ℹ️
           </div>
         </div>
       </div>
     );
   }
   ```

5. **Build Color Palette Display in General Tab**
   
   Update General TabsContent:
   ```tsx
   <TabsContent value="general">
     <div className="space-y-6">
       <section>
         <h3 className="text-lg font-medium mb-4 text-text-primary">Appearance</h3>
         
         <div className="space-y-4">
           <p className="text-sm text-text-secondary">
             Theme and color customization will be available here in Phase 4.
           </p>
           
           <Separator />
           
           <div>
             <h4 className="font-medium mb-3 text-text-primary">Color System Reference</h4>
             <p className="text-xs text-text-muted mb-4">
               All colors used in the application. Dark mode values will be defined in Phase 2.
             </p>
             
             {/* Buttons Section */}
             <div className="space-y-3 mb-6">
               <h5 className="text-sm font-medium text-text-secondary">Buttons</h5>
               <ColorSwatch 
                 name="Primary Button"
                 token="btn-primary"
                 usage="Save, Confirm, Primary actions"
                 className="bg-btn-primary"
               />
               <ColorSwatch 
                 name="Secondary Button"
                 token="btn-secondary"
                 usage="Cancel, Back, Secondary actions"
                 className="bg-btn-secondary"
               />
               <ColorSwatch 
                 name="Destructive Button"
                 token="btn-destructive"
                 usage="Delete, Remove, Dangerous actions"
                 className="bg-btn-destructive"
               />
             </div>
             
             {/* Status Badges Section */}
             <div className="space-y-3 mb-6">
               <h5 className="text-sm font-medium text-text-secondary">Status Badges</h5>
               <ColorSwatch 
                 name="Exported"
                 token="status-exported"
                 usage="Files that have been exported"
                 className="bg-status-exported"
               />
               <ColorSwatch 
                 name="Enhanced"
                 token="status-enhanced"
                 usage="Files with AI enhancement applied"
                 className="bg-status-enhanced"
               />
               {/* Add more status badges... */}
             </div>
             
             {/* Add more sections: Backgrounds, Text, Icons, etc. */}
           </div>
         </div>
       </section>
     </div>
   </TabsContent>
   ```

**Testing Checklist:**
- [ ] `npm run build-renderer` succeeds
- [ ] No TypeScript errors
- [ ] Can see color swatches in General tab
- [ ] All new Tailwind classes work (inspect in dev tools)
- [ ] Light mode colors display correctly

#### Deliverables Phase 1:
- [ ] New "General" tab in Settings (placeholder)
- [ ] Names content moved to Sanitise tab successfully
- [ ] Color audit completed and documented
- [ ] Semantic tokens defined in `tailwind.config.js`
- [ ] CSS variables added for light mode
- [ ] ColorSwatch component created
- [ ] Color palette reference visible in General tab

---

### Phase 2: Dark Mode Token Definitions 🌙

**Goal:** Define dark mode variants for all semantic tokens

**Duration:** 1-2 days

#### Tasks:

1. **Add Dark Mode CSS Variables**
   
   Update `frontend/styles/globals.css` (expand existing `.dark` section):
   ```css
   .dark {
     /* Buttons - lighter/more vibrant in dark mode */
     --color-btn-primary: 96 165 250;           /* blue-400 */
     --color-btn-primary-hover: 59 130 246;     /* blue-600 */
     --color-btn-secondary: 148 163 184;        /* slate-400 */
     --color-btn-secondary-hover: 100 116 139;  /* slate-600 */
     --color-btn-destructive: 248 113 113;      /* red-400 */
     --color-btn-destructive-hover: 239 68 68;  /* red-500 */
     --color-btn-outline: transparent;
     --color-btn-outline-hover: 30 41 59;       /* slate-800 */
     --color-btn-ghost-hover: 30 41 59;         /* slate-800 */
     
     /* Tabs */
     --color-tab-active: 51 65 85;              /* slate-700 */
     --color-tab-active-text: 248 250 252;      /* slate-50 */
     --color-tab-inactive: 0 0 0;               /* transparent */
     --color-tab-inactive-text: 148 163 184;    /* slate-400 */
     --color-tab-hover: 30 41 59;               /* slate-800 */
     
     /* Status Badges - inverted for dark mode */
     --color-status-exported: 22 101 52;        /* green-800 (darker bg) */
     --color-status-exported-text: 220 252 231; /* green-100 (lighter text) */
     --color-status-enhanced: 91 33 182;        /* purple-800 */
     --color-status-enhanced-text: 243 232 255; /* purple-100 */
     --color-status-sanitised: 30 64 175;       /* blue-800 */
     --color-status-sanitised-text: 219 234 254;/* blue-100 */
     --color-status-transcribed: 55 48 163;     /* indigo-800 */
     --color-status-transcribed-text: 224 231 255; /* indigo-100 */
     --color-status-processing: 30 64 175;      /* blue-800 */
     --color-status-processing-text: 219 234 254; /* blue-100 */
     --color-status-error: 153 27 27;           /* red-800 */
     --color-status-error-text: 254 226 226;    /* red-100 */
     --color-status-unprocessed: 55 65 81;      /* gray-700 */
     --color-status-unprocessed-text: 243 244 246; /* gray-100 */
     
     /* Backgrounds */
     --color-bg-app: 15 23 42;                  /* slate-900 */
     --color-bg-card: 30 41 59;                 /* slate-800 */
     --color-bg-secondary: 30 41 59;            /* slate-800 */
     --color-bg-tertiary: 51 65 85;             /* slate-700 */
     --color-bg-input: 51 65 85;                /* slate-700 */
     
     /* Text */
     --color-text-primary: 248 250 252;         /* slate-50 */
     --color-text-secondary: 226 232 240;       /* slate-200 */
     --color-text-tertiary: 203 213 225;        /* slate-300 */
     --color-text-muted: 148 163 184;           /* slate-400 */
     --color-text-inverse: 15 23 42;            /* slate-900 */
     
     /* Borders */
     --color-border-default: 51 65 85;          /* slate-700 */
     --color-border-secondary: 71 85 105;       /* slate-600 */
     --color-border-focus: 96 165 250;          /* blue-400 */
     --color-border-error: 248 113 113;         /* red-400 */
     
     /* Icons */
     --color-icon-primary: 96 165 250;          /* blue-400 */
     --color-icon-secondary: 148 163 184;       /* slate-400 */
     --color-icon-success: 74 222 128;          /* green-400 */
     --color-icon-warning: 251 191 36;          /* yellow-400 */
     --color-icon-error: 248 113 113;           /* red-400 */
     
     /* Alerts */
     --color-alert-info: 30 64 175;             /* blue-800 */
     --color-alert-info-text: 219 234 254;      /* blue-100 */
     --color-alert-success: 22 101 52;          /* green-800 */
     --color-alert-success-text: 220 252 231;   /* green-100 */
     --color-alert-warning: 146 64 14;          /* orange-800 */
     --color-alert-warning-text: 254 243 199;   /* yellow-100 */
     --color-alert-error: 153 27 27;            /* red-800 */
     --color-alert-error-text: 254 226 226;     /* red-100 */
   }
   ```

2. **Test Dark Mode Manually**
   ```javascript
   // In browser console:
   document.documentElement.classList.add('dark');
   
   // To remove:
   document.documentElement.classList.remove('dark');
   ```

3. **Update ColorSwatch Component**
   
   Already handles dark mode preview with nested `.dark` div (done in Phase 1B).

4. **Verify Contrast Ratios**
   - Use browser dev tools or online contrast checker
   - Ensure WCAG AA compliance (4.5:1 for normal text)
   - Adjust colors if needed

#### Deliverables Phase 2:
- [ ] Dark mode CSS variables defined
- [ ] All color swatches show both light and dark previews
- [ ] Manual dark mode toggle works (via browser console)
- [ ] Contrast ratios meet WCAG AA standards
- [ ] Documentation of dark mode color choices

---

### Phase 3: Component Refactoring 🔧

**Goal:** Refactor all components to use semantic tokens

**Duration:** 4-5 days

#### 3.1 Refactoring Strategy

**Order of Priority:**
1. UI primitives (`shared/ui/button.tsx`, `tabs.tsx`, etc.)
2. Shared components (`GlobalFileSelector`, `SystemResourceMonitor`)
3. Feature tabs (Upload, Transcribe, Sanitise, Enhance, Export, Settings)

**Approach:**
- Refactor one component at a time
- Test after each component
- Use git commits for each completed component
- If something breaks, easy to revert individual commit

#### 3.2 Component Refactoring Examples

**Example 1: Button Component**

Before:
```tsx
// shared/ui/button.tsx
const buttonVariants = cva(
  "...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        // ...
      }
    }
  }
);
```

After:
```tsx
const buttonVariants = cva(
  "...",
  {
    variants: {
      variant: {
        default: "bg-btn-primary text-white hover:bg-btn-primary-hover",
        destructive: "bg-btn-destructive text-white hover:bg-btn-destructive-hover",
        secondary: "bg-btn-secondary text-white hover:bg-btn-secondary-hover",
        outline: "bg-btn-outline hover:bg-btn-outline-hover text-text-primary border border-border-default",
        ghost: "hover:bg-btn-ghost-hover text-text-primary",
        // ...
      }
    }
  }
);
```

**Example 2: Icon Colors**

Before:
```tsx
<HardDrive className="w-5 h-5 text-blue-600" />
<Settings className="w-5 h-5" />
<FolderInput className="w-4 h-4 text-green-600" />
```

After:
```tsx
<HardDrive className="w-5 h-5 text-icon-primary" />
<Settings className="w-5 h-5 text-icon-secondary" />
<FolderInput className="w-4 h-4 text-icon-success" />
```

**Example 3: Status Badges**

Before:
```tsx
<Badge className="bg-green-100 text-green-800">Exported</Badge>
<Badge className="bg-purple-100 text-violet-600">Enhanced</Badge>
```

After:
```tsx
<Badge className="bg-status-exported text-status-exported-text">Exported</Badge>
<Badge className="bg-status-enhanced text-status-enhanced-text">Enhanced</Badge>
```

#### 3.3 Component Refactoring Checklist

**UI Components (Priority 1):**
- [ ] `/shared/ui/button.tsx`
- [ ] `/shared/ui/tabs.tsx`
- [ ] `/shared/ui/badge.tsx`
- [ ] `/shared/ui/card.tsx`
- [ ] `/shared/ui/input.tsx`
- [ ] `/shared/ui/textarea.tsx`
- [ ] `/shared/ui/alert.tsx`
- [ ] `/shared/ui/alert-dialog.tsx`
- [ ] `/shared/ui/dialog.tsx`
- [ ] `/shared/ui/select.tsx`
- [ ] `/shared/ui/switch.tsx`
- [ ] `/shared/ui/label.tsx`
- [ ] `/shared/ui/separator.tsx`

**Shared Components (Priority 2):**
- [ ] `/shared/GlobalFileSelector.tsx`
- [ ] `/shared/LoadingSpinner.tsx`
- [ ] `/shared/SystemResourceMonitor.tsx`
- [ ] `/shared/BatchDropdown.tsx`

**Feature Components (Priority 3):**
- [ ] `/features/upload/components/UploadTab.tsx`
- [ ] `/features/transcribe/components/TranscribeTab.tsx`
- [ ] `/features/sanitise/components/SanitiseTab.tsx`
- [ ] `/features/enhance/components/EnhanceTab.tsx`
- [ ] `/features/enhance/components/BatchProgressCard.tsx`
- [ ] `/features/export/components/ExportTab.tsx`
- [ ] `/features/settings/components/SettingsTab.tsx`

**Main App (Priority 4):**
- [ ] `/App.tsx`
- [ ] `/src/main.tsx`
- [ ] `/index.html` (if any inline styles)

#### 3.4 Testing After Each Refactor

```bash
# After each component:
1. npm run build-renderer  # Check for errors
2. npm run dev             # Visual check
3. Test component functionality
4. git add <file>
5. git commit -m "refactor: use semantic tokens in <component>"
```

#### 3.5 Special Cases

**getColorClasses() Function:**
Location: `/features/settings/components/SettingsTab.tsx:384-394`

Before:
```tsx
const getColorClasses = (color: string) => {
  const colorMap = {
    blue: 'border-blue-500 bg-blue-50 text-blue-700',
    purple: 'border-purple-500 bg-purple-50 text-purple-700',
    // ...
  };
  return colorMap[color as keyof typeof colorMap] || colorMap.blue;
};
```

After:
```tsx
const getColorClasses = (color: string) => {
  const colorMap = {
    blue: 'border-icon-primary bg-status-processing text-status-processing-text',
    purple: 'border-icon-primary bg-status-enhanced text-status-enhanced-text',
    green: 'border-icon-success bg-status-exported text-status-exported-text',
    orange: 'border-icon-warning bg-alert-warning text-alert-warning-text',
    red: 'border-icon-error bg-status-error text-status-error-text',
    indigo: 'border-icon-primary bg-status-transcribed text-status-transcribed-text',
  };
  return colorMap[color as keyof typeof colorMap] || colorMap.blue;
};
```

#### Deliverables Phase 3:
- [ ] All UI components use semantic tokens
- [ ] All shared components refactored
- [ ] All feature tabs refactored
- [ ] Main App.tsx refactored
- [ ] No hardcoded colors remaining (verify with grep)
- [ ] All components tested individually
- [ ] Visual regression: No changes in light mode
- [ ] Git history: One commit per component

---

### Phase 4: Theme Toggle Implementation 🎨

**Goal:** Implement user-facing theme switcher

**Duration:** 1-2 days

**IMPORTANT:** Remove dead code first!

#### 4.1 Clean Up Dead Code

Before implementing new theme system, remove existing unused code:

```tsx
// In App.tsx, DELETE this entire function (lines 76-107):
function useThemeSafe() {
  // ... DELETE ALL THIS ...
}
```

This hook exists but is never used. Removing it prevents naming conflicts.

#### 4.2 Create Theme Context

New file: `/frontend/src/contexts/ThemeContext.tsx`

```tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  
  // Load saved theme preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      setThemeState(saved);
    }
  }, []);
  
  // Listen to system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateSystemTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };
    
    updateSystemTheme(); // Initial check
    mediaQuery.addEventListener('change', updateSystemTheme);
    
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, [theme]);
  
  // Update resolved theme when user changes preference
  useEffect(() => {
    if (theme === 'light') {
      setResolvedTheme('light');
    } else if (theme === 'dark') {
      setResolvedTheme('dark');
    } else {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDark ? 'dark' : 'light');
    }
  }, [theme]);
  
  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);
  
  // Persist theme preference
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

#### 4.3 Wrap App in ThemeProvider

Update `/frontend/App.tsx`:

```tsx
// Add import at top:
import { ThemeProvider } from './src/contexts/ThemeContext';

// In the main App function, wrap return statement:
export default function App() {
  // ... all existing state and logic ...
  
  return (
    <ThemeProvider>
      <EnhancementConfigProvider>
        <main className="bg-bg-app font-smooth">
          {/* ... rest of app ... */}
        </main>
      </EnhancementConfigProvider>
    </ThemeProvider>
  );
}
```

**Note:** ThemeProvider wraps EnhancementConfigProvider so theme is available everywhere.

#### 4.4 Theme Selector UI

Update General tab in `/frontend/features/settings/components/SettingsTab.tsx`:

```tsx
import { useTheme } from '../../src/contexts/ThemeContext';
import { Sun, Moon, Monitor } from 'lucide-react';

// In SettingsTab component:
function SettingsTab() {
  const { theme, setTheme } = useTheme();
  
  return (
    // ... existing code ...
    
    <TabsContent value="general">
      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-medium mb-4 text-text-primary">Appearance</h3>
          
          {/* Theme Selector */}
          <div className="space-y-3 mb-6">
            <Label className="text-sm font-medium text-text-secondary">Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setTheme('light')}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${theme === 'light' 
                    ? 'border-border-focus bg-btn-primary/10' 
                    : 'border-border-default hover:border-border-focus'
                  }
                `}
              >
                <Sun className="w-6 h-6 text-icon-primary" />
                <span className="text-sm font-medium text-text-primary">Light</span>
              </button>
              
              <button
                onClick={() => setTheme('dark')}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${theme === 'dark' 
                    ? 'border-border-focus bg-btn-primary/10' 
                    : 'border-border-default hover:border-border-focus'
                  }
                `}
              >
                <Moon className="w-6 h-6 text-icon-primary" />
                <span className="text-sm font-medium text-text-primary">Dark</span>
              </button>
              
              <button
                onClick={() => setTheme('system')}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${theme === 'system' 
                    ? 'border-border-focus bg-btn-primary/10' 
                    : 'border-border-default hover:border-border-focus'
                  }
                `}
              >
                <Monitor className="w-6 h-6 text-icon-primary" />
                <span className="text-sm font-medium text-text-primary">System</span>
              </button>
            </div>
            <p className="text-xs text-text-muted">
              {theme === 'system' 
                ? 'Automatically matches your system preference' 
                : `Using ${theme} mode`}
            </p>
          </div>
          
          <Separator className="my-6" />
          
          {/* Color Palette Display (from Phase 1B) */}
          <div>
            <h4 className="font-medium mb-3 text-text-primary">Color System Reference</h4>
            {/* ... existing ColorSwatch components ... */}
          </div>
        </section>
      </div>
    </TabsContent>
  );
}
```

#### 4.5 Optional: Quick Theme Toggle

Add quick toggle button to app header (optional enhancement):

```tsx
// In App.tsx, add near SystemResourceMonitor:
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './src/contexts/ThemeContext';

function QuickThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  
  const toggleTheme = () => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  };
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
      className="text-icon-secondary hover:text-icon-primary"
    >
      {resolvedTheme === 'light' ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </Button>
  );
}

// Then add to header:
<div className="flex items-center gap-2">
  <QuickThemeToggle />
  <SystemResourceMonitor {...props} />
</div>
```

#### Deliverables Phase 4:
- [ ] Dead `useThemeSafe` code removed
- [ ] ThemeContext created
- [ ] ThemeProvider wraps app
- [ ] Theme selector UI in General tab
- [ ] Theme persistence to localStorage
- [ ] System preference detection working
- [ ] Optional quick toggle button
- [ ] Smooth transitions between themes
- [ ] No flash of unstyled content on load

---

### Phase 5: Custom Colors Foundation (Future) 🎨

**Goal:** Lay groundwork for user-customizable themes

**Duration:** 2-3 days (OPTIONAL - can be deferred)

**Status:** This phase is for future enhancement. Not required for initial dark mode support.

#### High-Level Plan:

1. **Color Picker UI**
   - Add color picker for each semantic token
   - Show live preview of changes
   
2. **Custom Color Persistence**
   - Save to localStorage
   - Export/import custom themes
   - Reset to defaults button
   
3. **Dynamic CSS Variable Updates**
   - Modify CSS variables on the fly
   - No page reload required

This phase can be implemented later once dark mode is stable.

---

## Technical Considerations

### Performance
- ✅ CSS Variables are fast (no performance concerns)
- ✅ Tailwind JIT mode only includes used classes
- ✅ Theme switching is instant (just toggle CSS class)

### Accessibility
- ✅ Contrast ratios meet WCAG AA (4.5:1 for normal text)
- ✅ Dark mode provides lower brightness for eye comfort
- ✅ Focus indicators visible in both modes
- ✅ System preference respected

### Browser Compatibility
- ✅ CSS Variables: All modern browsers (Edge 16+, Safari 10+, Chrome 49+)
- ✅ Dark mode media query: All modern browsers
- ✅ localStorage: Universal support

### Edge Cases
- ✅ System theme changes: App responds automatically
- ✅ Theme persistence: Works across app restarts
- ✅ No FOUC (flash of unstyled content): Theme applied before render

---

## Testing Plan

### Pre-Implementation Tests

1. **Baseline Screenshots**
   - Take screenshots of every tab in light mode
   - Document current behavior
   - Save as reference for visual regression

2. **Functional Tests**
   - Upload → Transcribe → Sanitise → Enhance → Export flow
   - Settings: All tabs functional
   - Names: Add/Edit/Delete person
   - MLX: Model selection and testing

### During Implementation

3. **Incremental Testing**
   - Test after EACH component refactor
   - Don't batch multiple changes
   - Use git commits to track progress

4. **Dark Mode Preview**
   ```javascript
   // Browser console:
   document.documentElement.classList.add('dark');
   ```
   - Verify colors render correctly
   - Check contrast ratios
   - Test all interactive states

### Post-Implementation

5. **Visual Regression**
   - Compare screenshots before/after
   - Ensure no unintended changes in light mode

6. **E2E Testing**
   - Full workflow in light mode
   - Full workflow in dark mode
   - Theme switching mid-workflow
   - System preference changes

7. **Accessibility Testing**
   - Run contrast checker on all color combinations
   - Test keyboard navigation
   - Verify focus indicators visible

---

## Migration Checklist

### Phase 1A: Settings Restructure
- [ ] Create feature branch: `feature/dark-mode-phase-1a`
- [ ] Take baseline screenshots
- [ ] Update TabsList: reorder triggers
- [ ] Change defaultValue to "general"
- [ ] Create General TabsContent (placeholder)
- [ ] Move Names section into Sanitise tab
- [ ] Test: All tabs navigable
- [ ] Test: Names functionality works
- [ ] Git commit: "feat: restructure settings tabs"
- [ ] Merge to main

### Phase 1B: Color System
- [ ] Create branch: `feature/dark-mode-phase-1b`
- [ ] Run color audit (grep commands)
- [ ] Document findings in Appendix A
- [ ] Update tailwind.config.js with tokens
- [ ] Add CSS variables to globals.css (light mode)
- [ ] Test: Build succeeds
- [ ] Create ColorSwatch component
- [ ] Build color palette display in General tab
- [ ] Test: Can see all color swatches
- [ ] Git commit: "feat: add semantic color tokens"
- [ ] Merge to main

### Phase 2: Dark Mode Tokens
- [ ] Create branch: `feature/dark-mode-phase-2`
- [ ] Add dark mode CSS variables
- [ ] Test dark mode manually (browser console)
- [ ] Verify contrast ratios
- [ ] Update ColorSwatch to show both modes
- [ ] Test: All swatches show light/dark previews
- [ ] Git commit: "feat: add dark mode color definitions"
- [ ] Merge to main

### Phase 3: Component Refactoring
- [ ] Create branch: `feature/dark-mode-phase-3`
- [ ] Refactor UI components (one commit each)
- [ ] Refactor shared components (one commit each)
- [ ] Refactor feature components (one commit each)
- [ ] Refactor App.tsx
- [ ] Run final grep: verify no hardcoded colors
- [ ] Visual regression test
- [ ] Git push all commits
- [ ] Merge to main

### Phase 4: Theme Toggle
- [ ] Create branch: `feature/dark-mode-phase-4`
- [ ] Remove dead useThemeSafe code
- [ ] Create ThemeContext
- [ ] Wrap app in ThemeProvider
- [ ] Build theme selector UI
- [ ] Add optional quick toggle
- [ ] Test: Theme switching works
- [ ] Test: Persistence works
- [ ] Test: System preference works
- [ ] Git commit: "feat: implement theme toggle"
- [ ] Merge to main

---

## Rollback Plan

### Quick Rollback (< 5 minutes)
```bash
git stash
git checkout main
npm run dev
```

### Partial Rollback (keep some changes)
```bash
# Revert specific file
git checkout main -- <file-path>

# Keep other changes
git add -A
git commit -m "Partial rollback: revert <component>"
```

### Nuclear Option
```bash
git reset --hard origin/main
npm install
npm run dev
```

---

## Success Metrics

### Phase 1:
- [ ] Settings tabs restructured successfully
- [ ] Names section works in Sanitise tab
- [ ] All semantic tokens defined
- [ ] Color reference visible in UI

### Phase 2:
- [ ] Dark mode colors defined
- [ ] Contrast ratios meet WCAG AA
- [ ] Manual dark mode toggle works

### Phase 3:
- [ ] 100% of components use semantic tokens
- [ ] Zero hardcoded colors (verified by grep)
- [ ] No visual regressions in light mode

### Phase 4:
- [ ] Theme toggle UI functional
- [ ] Theme persistence works
- [ ] System preference detection works
- [ ] Smooth theme transitions

### Overall:
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] All tests passing
- [ ] Documentation updated

---

## Timeline Estimate

### Realistic Timeline:
- **Phase 1A** (Settings restructure): 2 days
- **Phase 1B** (Color system): 2-3 days
- **Phase 2** (Dark mode tokens): 1-2 days
- **Phase 3** (Component refactoring): 4-5 days
- **Phase 4** (Theme toggle): 1-2 days
- **Phase 5** (Custom colors): FUTURE (2-3 days when needed)

**Total:** 10-14 days (excluding Phase 5)

### Buffer Time:
Add 20% buffer for unexpected issues: **12-17 days total**

---

## Risk Assessment

### Critical Risks (Mitigated):
1. ✅ **Settings tab restructure** - Solution: Keep state in parent, test thoroughly
2. ✅ **Color token approach** - Solution: Use corrected hybrid approach (Tailwind + CSS vars)
3. ✅ **Dead code conflict** - Solution: Remove useThemeSafe before Phase 4
4. ✅ **State management** - Solution: Don't refactor state initially, just move UI

### Medium Risks:
1. 🟡 **Icon inconsistency** - Mitigation: Define icon tokens, refactor systematically
2. 🟡 **Badge colors** - Mitigation: Test thoroughly with both backgrounds
3. 🟡 **cn() utility** - Mitigation: Verify custom classes aren't stripped

### Low Risks:
1. 🟢 **CSS variables** - Already exist, just need expansion
2. 🟢 **Tailwind config** - Already set up correctly
3. 🟢 **System preference** - Code already exists

**Overall Risk Level:** 🟡 Medium (manageable)

**Go/No-Go Decision:** 🟢 **GO** - All critical risks have solutions

---

## Documentation Updates

After implementation, update:

1. **WARP.md**
   - Add section on theming system
   - Document semantic color tokens
   - Explain how to use tokens in components

2. **README.md**
   - Add "Dark Mode Support" to features list
   - Add screenshots showing light/dark modes

3. **Developer Guide** (new)
   ```markdown
   ## Using Colors
   
   Always use semantic tokens:
   
   ✅ Correct:
   ```tsx
   <Button className="bg-btn-primary hover:bg-btn-primary-hover">
     Save
   </Button>
   ```
   
   ❌ Wrong:
   ```tsx
   <Button className="bg-blue-600 hover:bg-blue-700">
     Save
   </Button>
   ```
   
   See `/frontend/tailwind.config.js` for full token list.
   ```

4. **Color Token Reference** (new)
   - Visual guide showing all tokens
   - Usage examples for each token
   - Dark mode color decisions explained

---

## Appendix A: Color Inventory

Will be populated during Phase 1B color audit.

### Buttons
| Component | Current Light | Location | Proposed Token |
|-----------|--------------|----------|----------------|
| Save Paths | `bg-blue-600 hover:bg-blue-700` | SettingsTab:510 | `btn-primary` |
| Save Names | `bg-blue-600 hover:bg-blue-700` | SettingsTab:578 | `btn-primary` |
| Save Sanitise | `bg-blue-600 hover:bg-blue-700` | SettingsTab:694 | `btn-primary` |
| ... | ... | ... | ... |

### Icons
| Component | Current | Location | Proposed Token |
|-----------|---------|----------|----------------|
| HardDrive | `text-blue-600` | SettingsTab:432 | `icon-primary` |
| FolderInput | `text-green-600` | SettingsTab:451 | `icon-success` |
| ... | ... | ... | ... |

### Status Badges
| Status | Current | Location | Proposed Token |
|--------|---------|----------|----------------|
| Exported | `bg-green-100 text-green-800` | GlobalFileSelector | `status-exported` |
| Enhanced | `bg-purple-100 text-violet-600` | GlobalFileSelector | `status-enhanced` |
| ... | ... | ... | ... |

*(Table will be filled during implementation)*

---

## Appendix B: Key File Locations

### Configuration
- `/frontend/tailwind.config.js` - Semantic token definitions
- `/frontend/styles/globals.css` - CSS variables (light/dark)

### Core Components
- `/frontend/App.tsx` - Main app wrapper, ThemeProvider
- `/frontend/src/contexts/ThemeContext.tsx` - Theme state management

### Settings
- `/frontend/features/settings/components/SettingsTab.tsx` - Settings tabs
- `/frontend/features/settings/components/ColorSwatch.tsx` - Color reference UI

### UI Components
- `/frontend/shared/ui/button.tsx` - Button variants
- `/frontend/shared/ui/tabs.tsx` - Tab components
- `/frontend/shared/ui/badge.tsx` - Status badges
- (All other UI components in `/frontend/shared/ui/`)

---

## Next Steps

1. ✅ Review this implementation plan
2. ✅ Approve or request changes
3. 🔄 Begin Phase 1A (Settings restructure)
4. ⏳ Continue through phases sequentially

**Ready to proceed with Phase 1A?** Create feature branch and start implementation.

---

**Last Updated:** 2025-10-26  
**Version:** 2.0 (Updated with code analysis findings)  
**Status:** Ready for Implementation ✅
