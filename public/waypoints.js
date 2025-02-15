document.addEventListener("DOMContentLoaded", function () {
  const token = sessionStorage.getItem("authToken");
  if (!token) {
    alert("Unauthorized: Please log in first.");
    window.location.href = "/index.html";
    return;
  }

  const eventSelect = document.getElementById("eventSelect");
  const deviceSelect = document.getElementById("deviceSelect");
  const processTable = document.getElementById("processTable").querySelector("tbody");
  const waypointTable = document.getElementById("waypointTable").querySelector("tbody");

  function logout() {
    sessionStorage.removeItem("authToken");
    window.location.href = "/index.html";
  }

  async function fetchEvents() {
    const response = await fetch("/api/events", { headers: { Authorization: `Bearer ${token}` } });
    const events = await response.json();
    eventSelect.innerHTML = events.map(event => `<option value="${event}">${event}</option>`).join("");
    if (events.length > 0) {
      eventSelect.value = events[0];
      fetchTrackersForEvent(events[0]);
    }
  }

  async function fetchTrackersForEvent(event) {
    const response = await fetch(`/api/events/${event}/trackers`, { headers: { Authorization: `Bearer ${token}` } });
    const trackers = await response.json();
    deviceSelect.innerHTML = trackers.map(tracker => `<option value="${tracker}">${tracker}</option>`).join("");
  }

  eventSelect.addEventListener("change", () => fetchTrackersForEvent(eventSelect.value));

  document.getElementById("waypointForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const trackerUid = deviceSelect.value;
    const assignedEvent = eventSelect.value;
    const maxPoints = parseInt(document.getElementById("maxPoints").value);

    const response = await fetch("/api/start-process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ tracker_uid: trackerUid, event: assignedEvent, max_points: maxPoints })
    });

    if (response.ok) {
      const process = await response.json();
      updateProcessTable(process);
    }
  });

  async function fetchProcessStatus() {
    const response = await fetch("/api/process-status", { headers: { Authorization: `Bearer ${token}` } });
    const processes = await response.json();
    processTable.innerHTML = processes.map(process => `
      <tr>
        <td>${process.tracker_uid}</td>
        <td>${process.event}</td>
        <td>${process.max_points}</td>
        <td>${process.current_points}</td>
        <td>${Math.round((process.current_points / process.max_points) * 100)}%</td>
        <td>${process.state}</td>
        <td>
          <button onclick="pauseProcess('${process.tracker_uid}')">Pause</button>
          <button onclick="stopProcess('${process.tracker_uid}')">Stop</button>
        </td>
      </tr>`).join("");
  }

  async function stopProcess(trackerUid) {
    const response = await fetch("/api/stop-process", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tracker_uid: trackerUid })
    });
    if (response.ok) {
      const waypoint = await response.json();
      addWaypointToTable(waypoint);
    }
  }

  function addWaypointToTable(waypoint) {
    waypointTable.innerHTML += `
      <tr>
        <td>${waypoint.id}</td>
        <td>${waypoint.lat}</td>
        <td>${waypoint.lon}</td>
        <td>${waypoint.type}</td>
      </tr>`;
  }

  fetchEvents();
  document.getElementById("logoutButton").addEventListener("click", logout);

  // Set interval to update process data every 5 seconds
  setInterval(fetchProcessStatus, 5000);
});
