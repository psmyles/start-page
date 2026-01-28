// --- Existing Date/Time Logic ---
function updateDateTime() {
  const now = new Date();
  const dateElement = document.getElementById("date");
  const timeElement = document.getElementById("time");

  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = now.toLocaleDateString(undefined, options);

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  const formattedTime = `${hours}:${minutes} ${ampm}`;

  dateElement.textContent = formattedDate;
  timeElement.textContent = formattedTime;
}

updateDateTime();
setInterval(updateDateTime, 10000);

// --- New Toggle Logic ---
const toggle = document.getElementById('url-toggle');
const icons = document.querySelectorAll('.icon');

// Function to update URLs based on state
function updateURLs(isInternet) {
  icons.forEach(icon => {
    if (isInternet) {
      icon.href = icon.getAttribute('data-internet');
    } else {
      icon.href = icon.getAttribute('data-local');
    }
  });
}

// Load saved preference on startup
const savedMode = localStorage.getItem('mode');
if (savedMode === 'internet') {
  toggle.checked = true;
  updateURLs(true);
} else {
  toggle.checked = false;
  updateURLs(false); // Default to Local
}

// Listen for toggle changes
toggle.addEventListener('change', (e) => {
  const isInternet = e.target.checked;
  updateURLs(isInternet);
  
  // Save preference
  localStorage.setItem('mode', isInternet ? 'internet' : 'local');
});