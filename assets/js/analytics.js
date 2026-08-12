/* ============================================================
   CalcInvest — Vercel Web Analytics Integration
   Uses @vercel/analytics package with inject() method
   Automatically loads in production, disabled in dev
   ============================================================ */

import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject({
  mode: 'auto', // Automatically detect environment
  debug: false  // Set to true for debugging
});
