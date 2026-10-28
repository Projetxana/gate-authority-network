// No cookies, trackers, customer data, or credentials are read by this page.
const installButton = document.getElementById('copyInstall');
if (installButton) {
  installButton.addEventListener('click', async () => {
    const command = 'npm install @gate-avn/sdk@0.1.0-dev.4';
    try {
      await navigator.clipboard.writeText(command);
      installButton.textContent = 'Copied ✓';
    } catch {
      installButton.textContent = 'Select command above';
    }
  });
}
