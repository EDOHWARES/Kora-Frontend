# PWA Update Testing Guide (#984)

This guide documents how to manually test the deferred service worker activation policy implemented in #984.

## Prerequisites

- Installed Kora PWA (via "Add to Home Screen" or browser install prompt)
- Two deployed versions (current + new) to trigger update flow
- Browser DevTools with Service Worker inspector (Chrome, Firefox, Edge)

## Local Development Testing

### Setup

1. Start dev server (PWA disabled in dev mode, so build for production locally):
   ```bash
   npm run build
   npm run start  # Starts Next.js in production mode
   ```

2. Navigate to `http://localhost:3000` in a PWA-capable browser

3. Open browser DevTools → Application → Service Workers

### Scenario 1: Initial Installation

**Expected:**
- SW installs and activates (no waiting state on first install)
- No update banner visible (no waiting worker)

**Verify:**
- [ ] Service Workers tab shows state: "activated"
- [ ] No "dismissed" or "error" entries
- [ ] SwUpdateBanner is not rendered in the DOM

### Scenario 2: Update Arrives During Idle

**Setup:**
1. Keep the dev server running
2. Modify a file (e.g., add a console.log to App.tsx)
3. Trigger dev rebuild (if in watch mode, it rebuilds automatically)
4. Browser checks for SW updates

**Expected:**
- New SW enters "waiting" state
- SwUpdateBanner appears at top of screen
- "Update" button is enabled

**Verify:**
- [ ] Service Workers tab shows two entries: "activated" and "waiting"
- [ ] SwUpdateBanner visible with message: "A new version of Kora Protocol is available."
- [ ] "Update" button is clickable
- [ ] "Later" button dismisses banner

### Scenario 3: Update Deferred During Signing

**Setup:**
1. Navigate to dashboard (requires wallet connection)
2. Initiate a transaction (e.g., Fund Invoice)
3. UI shows signing UI (modal or in-progress overlay)
4. While signing: trigger an update (rebuild if needed, or manually dispatch update event)

**Expected:**
- SwUpdateBanner appears but "Update" button is DISABLED
- Message changes to: "Update available — will be applied after you complete signing."
- Banner is dismissed when you click "Later"

**Verify:**
- [ ] SwUpdateBanner renders with deferred message
- [ ] "Update" button has `disabled` attribute
- [ ] "Later" dismisses the banner
- [ ] sessionStorage does NOT have "pwa-update-triggered" flag set

### Scenario 4: Deferred Update Resumes After Signing

**Setup:**
1. Continue from Scenario 3
2. Complete the signing (approve in wallet extension or cancel)
3. Signing state transitions to "idle" (confirmed or failed)

**Expected:**
- SwUpdateBanner re-appears with message: "A new version of Kora Protocol is available."
- "Update" button is now ENABLED
- User can click "Update" to activate new SW

**Verify:**
- [ ] SwUpdateBanner re-rendered after signing completes
- [ ] Message changed back to "A new version..."
- [ ] "Update" button is now clickable
- [ ] Session storage can now be set when clicked

### Scenario 5: User-Triggered Update

**Setup:**
1. Update is available and deferred message is showing
2. User is not signing
3. User clicks "Update" button

**Expected:**
- SKIP_WAITING message sent to waiting worker
- sessionStorage flag set: `"pwa-update-triggered" = "true"`
- Page reloads after controllerchange event
- New SW version becomes active

**Verify:**
- [ ] Service Workers tab shows only "activated" state (one worker, not two)
- [ ] New version is active (check if code change is visible, e.g., console.log)
- [ ] sessionStorage flag was cleared after reload
- [ ] No "dismissed" state in Service Workers tab

### Scenario 6: No Double-Reload

**Setup:**
1. Have a waiting update available
2. Click "Update" to trigger SKIP_WAITING
3. Monitor Network tab and page reload count

**Expected:**
- Page reloads exactly ONCE
- Network tab shows single reload (not repeated reloads)
- Service Workers tab shows single "activated" worker

**Verify:**
- [ ] Reload count in DevTools Performance monitor is 1
- [ ] No console errors about "reload in progress"
- [ ] sessionStorage flag is cleared (checked after reload)

## Production Testing Checklist

### Deployment

- [ ] Build passes: `npm run build`
- [ ] No linting errors: `npm run lint`
- [ ] Tests pass: `npm run test`
- [ ] Commit message: `fix(pwa): align skipWaiting with deferred activation (#984)`

### Post-Deployment

1. **First deployment (v1.0.0)**
   - [ ] Install PWA on mobile/desktop
   - [ ] Service Workers tab shows "activated" state
   - [ ] No update banner (no waiting worker yet)

2. **Second deployment (v1.0.1)**
   - [ ] Wait for SW check (browser checks every 24h, or force check via DevTools)
   - [ ] Update banner appears
   - [ ] Banner message: "A new version of Kora Protocol is available."
   - [ ] "Update" button enables new version activation

3. **During active session**
   - [ ] Start a transaction (fund/repay/claim)
   - [ ] If update arrives during signing:
     - [ ] "Update" button is DISABLED
     - [ ] Message shows: "will be applied after you complete signing"
   - [ ] Complete signing
   - [ ] Update button ENABLED
   - [ ] Click update → page reloads
   - [ ] New version is active

### Regression Testing

- [ ] Sensitive routes still use NetworkOnly caching
- [ ] No-store headers present on `/dashboard`, `/transactions`, etc.
- [ ] Signing still works after SW update
- [ ] Offline page still works (fallback document)
- [ ] No unhandled console errors in DevTools

## Console Commands for Manual Testing

### Check current SW registration

```javascript
navigator.serviceWorker.ready.then(reg => {
  console.log("Active SW:", reg.active);
  console.log("Waiting SW:", reg.waiting);
  console.log("Installing SW:", reg.installing);
});
```

### Force check for updates

```javascript
navigator.serviceWorker.ready.then(reg => reg.update());
```

### Manually send SKIP_WAITING

```javascript
navigator.serviceWorker.ready.then(reg => {
  if (reg.waiting) {
    sessionStorage.setItem("pwa-update-triggered", "true");
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
  } else {
    console.log("No waiting worker");
  }
});
```

### Check sessionStorage flag

```javascript
console.log("Update triggered:", sessionStorage.getItem("pwa-update-triggered"));
```

### Simulate signing state (for testing)

```javascript
// This requires importing useUIStore in the console, which is not exposed by default.
// Instead, use the SwUpdateBanner UI to test the deferred behavior.
```

## Troubleshooting

### Update banner not appearing

**Cause:** No waiting worker
- [ ] Confirm new SW version is deployed
- [ ] Force update check: `navigator.serviceWorker.ready.then(reg => reg.update())`
- [ ] Wait 24 hours (browser checks daily by default)
- [ ] Check DevTools → Application → Service Workers

**Cause:** Browser is in incognito/private mode
- [ ] PWAs may not work in incognito; use normal browsing mode
- [ ] Confirm PWA is installed (not just visited)

### Page reloads multiple times

**Cause:** sessionStorage flag not cleared
- [ ] Check DevTools → Application → Session Storage for "pwa-update-triggered"
- [ ] If present, clear it: `sessionStorage.removeItem("pwa-update-triggered")`
- [ ] Reload page manually

**Cause:** controllerchange listener is broken
- [ ] Check console for errors in providers.tsx listener
- [ ] Verify useUIStore is accessible and not throwing errors

### "Update" button stays disabled

**Cause:** User is actively signing
- [ ] Complete the transaction in progress
- [ ] Close any signing dialogs
- [ ] Verify `uiStore.txState.status` is "idle" (check in console)

### Old version is still active after update

**Cause:** SKIP_WAITING message not received
- [ ] Check browser console for errors
- [ ] Verify waiting worker received message (DevTools Network tab)
- [ ] Try clicking "Update" again
- [ ] Manually hard-refresh page (Ctrl+Shift+R)

## Performance Monitoring

### Metrics to track

- **Update detection latency:** Time from new SW deployment to banner appearance
- **Update activation latency:** Time from user clicking "Update" to new version active
- **No double-reload events:** Confirm counter stays at 1 per update
- **User adoption:** Percentage of users who click "Update" vs. "Later"

### Example analytics

```typescript
// In SwUpdateBanner or providers.tsx, track:
// - updateBannerShown event
// - updateClicked event
// - updateDeferred event (clicked during signing)
// - updateCompleted event (after page reload)
```

---

## See Also

- Issue #984: Reconcile skipWaiting:true with deferred SW activation policy
- `docs/architecture.md` - PWA Service Worker section
- `components/pwa/SwUpdateBanner.tsx` - Update banner component
- `app/providers.tsx` - Service worker listener
- `next.config.js` - PWA configuration
