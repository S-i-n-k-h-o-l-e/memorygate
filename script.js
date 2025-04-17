document.addEventListener("DOMContentLoaded", function () {
  const inputs = document.querySelectorAll("input[type='text']");
  const growBtn = document.getElementById("grow-button");

  inputs.forEach((input, index) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[index + 1];
        if (next) {
          next.focus();
        } else {
          growBtn.focus();
        }
      }
    });
  });

  growBtn.addEventListener("click", () => {
    const where = document.getElementById("where").value.trim();
    const what = document.getElementById("what").value.trim();
    const feel = document.getElementById("feel").value.trim();

    if (where && what && feel) {
      growBranch(`${where} — ${what} — ${feel}`);
    }
  });
});

let angle = 0;
let lastX = 400;
let lastY = 400;

function growBranch(text) {
  const svg = document.getElementById("tree-canvas");
  const ns = "http://www.w3.org/2000/svg";

  const length = Math.random() * 100 + 50;
  angle += (Math.random() - 0.5) * 40;

  const radians = (angle * Math.PI) / 180;
  const newX = lastX + Math.cos(radians) * length;
  const newY = lastY - Math.sin(radians) * length;

  const path = document.createElementNS(ns, "path");
  const d = `M${lastX},${lastY} Q${(lastX + newX) / 2},${(lastY + newY) / 2 - 30} ${newX},${newY}`;
  path.setAttribute("d", d);
  path.setAttribute("stroke", "#4fffb0");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("opacity", "0.8");
  svg.appendChild(path);

  const textEl = document.createElementNS(ns, "text");
  textEl.setAttribute("x", newX + 5);
  textEl.setAttribute("y", newY);
  textEl.setAttribute("fill", "#ccffee");
  textEl.setAttribute("font-size", "14");
  textEl.textContent = text;
  svg.appendChild(textEl);

  lastX = newX;
  lastY = newY;
}