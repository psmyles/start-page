// CHANGE THIS if your repo is named differently
const GITHUB_BASE_URL = 'https://psmyles.github.io/start-page/'; 

async function loadLiveSite() {
    try {
        // 1. Fetch the raw HTML from your repo
        const response = await fetch(GITHUB_BASE_URL + 'index.html');
        if (!response.ok) throw new Error('Network response was not ok');
        const htmlText = await response.text();

        // 2. Parse the HTML so we can modify links before showing it
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // 3. Helper function to fix relative URLs
        const fixUrl = (url) => {
            if (!url) return url;
            if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) {
                return url;
            }
            return GITHUB_BASE_URL + url;
        };

        // 4. Update CSS Links (<link href="...">)
        doc.querySelectorAll('link[href]').forEach(el => {
            el.href = fixUrl(el.getAttribute('href'));
        });

        // 5. Update Script sources (<script src="...">)
        doc.querySelectorAll('script[src]').forEach(el => {
            el.src = fixUrl(el.getAttribute('src'));
        });

        // 6. Update Images (<img src="...">)
        doc.querySelectorAll('img[src]').forEach(el => {
            el.src = fixUrl(el.getAttribute('src'));
        });

        // 7. Inject the modified HTML into the current page
        document.documentElement.innerHTML = doc.documentElement.innerHTML;

        // 8. Re-activate Scripts
        // (Browsers don't run scripts inserted via innerHTML, so we append them manually)
        const scripts = document.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            if (oldScript.src) {
                newScript.src = oldScript.src; // Points to GitHub URL now
            } else {
                newScript.textContent = oldScript.textContent;
            }
            document.body.appendChild(newScript);
        });

    } catch (error) {
        console.error('Startpage Load Error:', error);
        // Fallback display if offline or GitHub is down
        document.body.innerHTML = `
            <div style="color:#666; font-family:sans-serif; text-align:center; margin-top:20%;">
                <h1>Offline</h1>
                <p>Could not load startpage from GitHub.</p>
                <p style="font-size:0.8em">${error.message}</p>
            </div>
        `;
    }
}

loadLiveSite();