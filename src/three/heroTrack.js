import { Track } from './track.js';

// vitesse au pas pendant l'impression du ticket (0.34 u en 1.5 s)
const CREEP = Math.hypot(-0.33 - -0.15, 7.43 - 7.72) / 1.5;
// vitesse d'arrivée (entrée dans le champ), identique à l'ancien freinage "softout"
const ARRIVAL = (3 * Math.hypot(2.35 - -0.15, 11.79 - 7.72)) / 1.5;
// prolongements hors champ (le cadre vidéo est plus large que la maquette)
const LEAD_IN = 1.6; // u, avant l'arrivée
const LEAD_OUT = 3.0; // u, après la sortie
const EXIT_ACCEL = 0.2; // part du temps de sortie passée à accélérer (voir EASES.accel)

function segments(exitTail) {
  const dir = [2.35 - -0.15, 11.79 - 7.72];
  const len = Math.hypot(dir[0], dir[1]);
  const start = [2.35 + (dir[0] / len) * LEAD_IN, 11.79 + (dir[1] / len) * LEAD_IN];
  const segs = [
    // arrivée en diagonale depuis le bas à droite (hors champ) à vitesse constante...
    { t: [-1.5 - LEAD_IN / ARRIVAL, -1.5], pts: [start, [2.35, 11.79]], ease: 'linear' },
    // ... puis freinage jusqu'à la borne d'entrée
    { t: [-1.5, 0], pts: [[2.35, 11.79], [-0.15, 7.72]], v: [ARRIVAL, CREEP] },
    // avance au pas pendant l'impression du ticket
    { t: [0, 1.5], pts: [[-0.15, 7.72], [-0.33, 7.43]], ease: 'linear' },
    // entre dans le parking, se redresse puis tourne vers la place du milieu
    {
      t: [1.5, 3.9],
      path: [
        [[-0.33, 7.43], [-0.68, 6.86], [-0.16, 6.45], [-0.13, 5.9]],
        [[-0.13, 5.9], [-0.12, 5.6], [0.34, 5.36], [0.52, 5.12]],
        [[0.52, 5.12], [0.76, 4.8], [1.4, 4.67], [1.84, 4.6]],
      ],
      v: [CREEP, 0],
      soft: true,
      smooth: 0.35,
    },
    // garée
    { t: [3.9, 4.6], hold: true },
    // marche arrière en braquant sec : l'arrière part vers la caméra
    { t: [4.6, 6.05], pts: [[1.84, 4.6], [1.0499, 4.7257], [0.47, 4.8], [0.25, 5.15]], reverse: true, ease: 'smoother', smooth: 0.25 },
    { t: [6.05, 7.8], hold: true },
    // repart vers le robot, tourne à droite et longe la rangée du haut jusqu'à la sortie
    // (premier point de contrôle aligné sur la fin de la marche arrière)
    {
      t: [7.8, 12.1],
      path: [
        [[0.25, 5.15], [0.649, 4.515], [0.12, 2.35], [0.8, 2.0]],
        [[0.8, 2.0], [1.6, 1.69], [3.4, 1.6], [4.74, 1.6]],
        [[4.74, 1.6], [11.0, 1.52]],
      ],
      ease: 'accel',
      smooth: 0.35,
    },
  ];
  if (exitTail) segs.push(exitTail);
  return segs;
}

// Trajectoire d'une voiture (temps τ relatif à son arrivée à la borne d'entrée).
// Vitesse continue d'un segment à l'autre et virages lissés (pas d'à-coup).
export function buildTrack() {
  // vitesse de croisière en fin de sortie, pour la prolonger hors champ sans à-coup
  const base = new Track(segments(null));
  const exit = base.segments[base.segments.length - 1];
  const cruise = exit.length / ((exit.t1 - exit.t0) * (1 - EXIT_ACCEL / 2));
  const end = [11.0 + LEAD_OUT, 1.52 - (0.08 * LEAD_OUT) / 6.26];
  return new Track(segments({ t: [12.1, 12.1 + LEAD_OUT / cruise], pts: [[11.0, 1.52], end], ease: 'linear' }));
}
