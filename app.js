function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    // Apply row colors
    if (row.completed === true) tr.classList.add("completed-row");
    if (row.asphalted === true) tr.classList.add("asphalted-row");

    tr.innerHTML = `
      <td class="dot-link" data-dot="${row["dot-number"]}">
        ${row["dot-number"] || ""}
      </td>
      <td>${row["mile-post"] || ""}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${row.track || ""}</td>
      <td>${row.type || ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${row.actual_footage || ""}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });

  // Make DOT number clickable → Google Maps
  document.querySelectorAll(".dot-link").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dot = cell.dataset.dot;
      if (dot) {
        window.open(
          `https://www.google.com/maps/search/${dot} railroad crossing`,
          "_blank"
        );
      }
    });
  });
}
