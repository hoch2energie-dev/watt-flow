/** Gemaltes Beispiel-Luftbild, 160 m Kantenlänge, Norden oben. Das dunkle Dach in der Mitte ist zum Nachzeichnen da. */
export function demoGround(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1600;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const k = 10;
  const px = (meters: number) => (meters + 80) * k;
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  g.fillStyle = "#74905a";
  g.fillRect(0, 0, 1600, 1600);
  const greens = ["#7d9a60", "#6b8752", "#84a167", "#66814f", "#8aa56c"];
  for (let i = 0; i < 30; i += 1) {
    g.fillStyle = greens[i % greens.length];
    g.fillRect(px(-80 + random() * 150), px(-80 + random() * 150), (12 + random() * 22) * k, (10 + random() * 20) * k);
  }
  for (let i = 0; i < 9000; i += 1) {
    g.fillStyle = random() > 0.5 ? "rgba(35,55,28,0.12)" : "rgba(215,230,185,0.10)";
    g.fillRect(random() * 1600, random() * 1600, 2 + random() * 4, 2 + random() * 4);
  }
  /* Straße im Norden mit Gehweg und Mittelstreifen */
  g.fillStyle = "#bdb8ab";
  g.fillRect(0, px(-34), 1600, 11.5 * k);
  g.fillStyle = "#83868a";
  g.fillRect(0, px(-32.5), 1600, 8.5 * k);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 2;
  g.setLineDash([30, 30]);
  g.beginPath();
  g.moveTo(0, px(-28.25));
  g.lineTo(1600, px(-28.25));
  g.stroke();
  g.setLineDash([]);

  const roof = (cx: number, cy: number, w: number, d: number, turnDeg: number, color: string, ridge: string) => {
    g.save();
    g.translate(px(cx), px(cy));
    g.rotate((turnDeg * Math.PI) / 180);
    g.fillStyle = "rgba(20,28,22,0.28)";
    g.fillRect((-w / 2 + 0.8) * k, (-d / 2 + 0.9) * k, w * k, d * k);
    g.fillStyle = color;
    g.fillRect((-w / 2) * k, (-d / 2) * k, w * k, d * k);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect((-w / 2) * k, (-d / 2) * k, w * k, (d / 2) * k);
    g.strokeStyle = ridge;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo((-w / 2) * k, 0);
    g.lineTo((w / 2) * k, 0);
    g.stroke();
    g.restore();
  };
  /* Zufahrt und Terrasse des Hauses in der Mitte */
  g.fillStyle = "#b3ad9f";
  g.fillRect(px(9), px(-23), 4 * k, 16 * k);
  g.fillStyle = "#cfc8b8";
  g.fillRect(px(-5), px(7), 9 * k, 4.5 * k);
  roof(0, 0, 12.4, 9, 14, "#2c3136", "#555b61");
  /* Dachfenster und Kamin als Anhaltspunkte */
  g.save();
  g.translate(px(0), px(0));
  g.rotate((14 * Math.PI) / 180);
  g.fillStyle = "#7f97a6";
  g.fillRect(-3.4 * k, 1.3 * k, 1.1 * k, 1.4 * k);
  g.fillRect(1.6 * k, -3 * k, 1.1 * k, 1.4 * k);
  g.fillStyle = "#b9b2a6";
  g.fillRect(3.6 * k, -1.2 * k, 0.8 * k, 0.8 * k);
  g.restore();
  roof(-34, -4, 12, 9, -6, "#7a3f34", "#93574b");
  roof(33, 3, 10.5, 9.5, 20, "#4d5359", "#6a7077");
  roof(6, -52, 14, 9.5, 2, "#6c3930", "#85524a");
  roof(-10, 36, 9, 8, 84, "#3b4045", "#5a6066");
  roof(-52, 40, 11, 8.5, -12, "#7d4337", "#97594c");
  /* Hecken */
  g.fillStyle = "#4a673e";
  for (const hedge of [[-18, -20, 1.2, 34], [20, -20, 1.2, 36], [-18, 14, 38, 1.2]]) g.fillRect(px(hedge[0]), px(hedge[1]), hedge[2] * k, hedge[3] * k);
  /* Baumkronen */
  for (const [x, y, r] of [[13, 9, 3.2], [-13, 10, 2.4], [24, -14, 2.8], [-40, 22, 3.4], [44, -22, 3]]) {
    g.fillStyle = "rgba(20,30,20,0.25)";
    g.beginPath();
    g.arc(px(x + 0.7), px(y + 0.8), r * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3f6b3a";
    g.beginPath();
    g.arc(px(x), px(y), r * k, 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}
