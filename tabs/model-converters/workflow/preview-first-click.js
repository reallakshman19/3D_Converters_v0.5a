/**
 * The popup's first Preview button is rendered synchronously, while the XML
 * file and staged-source reader are still awaiting initialization. Capture
 * that initial click before the production Build handler exists, then replay
 * it exactly once on the new, bound button after initialization.
 */
export async function armFirstXmlCiiPreviewBuild(root, initialize) {
  const host = root?.querySelector?.('#mc-preview-table-host');
  const firstButton = host?.querySelector?.('[data-mc-preview-build]');
  if (!firstButton) return initialize();
  let pending = false;
  firstButton.addEventListener('click', () => {
    if (pending) return;
    pending = true;
    firstButton.disabled = true;
    firstButton.textContent = 'Preparing Preview…';
    firstButton.dataset.mcPreviewInitializing = 'true';
  }, { once: true });
  try {
    await initialize();
    if (!pending || root?.isConnected === false || host?.isConnected === false ||
        root?.querySelector?.('#mc-preview-table-host') !== host) return;
    const bound = host.querySelector('[data-mc-preview-build]');
    if (!bound || bound === firstButton || bound.disabled) {
      throw new Error('Preview Build handler was not ready after initialization.');
    }
    bound.click();
  } catch (error) {
    if (pending && root?.querySelector?.('#mc-preview-table-host') === host) {
      host.textContent = 'Preview could not start: ' + String(error?.message || error);
    }
    throw error;
  }
}
