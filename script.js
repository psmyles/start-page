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

// Update every second
updateDateTime();
setInterval(updateDateTime, 1000);
