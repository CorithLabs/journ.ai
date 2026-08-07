import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Backgrounds ──────────────────────────────────────
        surface: {
          base: '#0a0f1a',    // deepest — page background
          raised: '#111827',  // sidebar, cards
          overlay: '#1a2235', // modals, drawers, popovers
          glass: 'rgba(17, 24, 39, 0.6)', // glassmorphism cards
        },
        // ── Accent — cyan/sky ─────────────────────────────────
        accent: {
          DEFAULT: '#06b6d4', // cyan-500 — primary CTA, active states
          light: '#67e8f9',   // cyan-300 — hover highlights, badges
          muted: '#0e7490',   // cyan-700 — subtle borders, outlines
          sky: '#0ea5e9',     // sky-500 — secondary accent
        },
        // ── Text ─────────────────────────────────────────────
        ink: {
          primary: '#f1f5f9',   // slate-100
          secondary: '#94a3b8', // slate-400
          muted: '#475569',     // slate-600
          inverse: '#0a0f1a',   // on accent buttons
        },
        // ── Categorical ──────────────────────────────────────
        // Colour-codes clipboard types and to-do categories. Deliberately
        // separate from `accent` (brand) and `status` (good/warning/bad):
        // these carry no judgement, they only need to be tellable apart.
        // Named by hue because that is all they mean.
        category: {
          slate: '#64748b',
          cyan: '#22d3ee',
          sky: '#38bdf8',
          violet: '#a78bfa',
          emerald: '#34d399',
          amber: '#fbbf24',
        },
        // ── Status ───────────────────────────────────────────
        status: {
          success: '#10b981', // emerald-500
          warning: '#f59e0b', // amber-500
          danger: '#ef4444',  // red-500
          info: '#06b6d4',    // same as accent
        },
      },
      /*
       * Corner radius, by role. Pick from the role, not by eye — mixing these
       * is what made cards, buttons and popovers all read as the same object.
       *
       *   rounded-modal  drawers, modals                     24px
       *   rounded-card   content cards, panels, popovers     16px
       *   rounded-xl     controls: buttons, inputs, selects  12px
       *   rounded-lg     small inline affordances, icon hits  8px
       *   rounded-full   pills, chips, badges, avatars
       */
      borderRadius: {
        card: '1rem',
        modal: '1.5rem',
      },
      backdropBlur: {
        glass: '12px',
      },
      boxShadow: {
        glass: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        glow: '0 0 16px rgba(6,182,212,0.35)',
        card: '0 2px 12px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
} satisfies Config;
