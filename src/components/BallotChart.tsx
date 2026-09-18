import { useEffect, useState } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, Legend, LinearScale, Tooltip, type ChartOptions } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import { AGAINST, type BallotResult, type Position } from '../engine/types';
import { nameOf } from '../announce';
import { fmtLimit, ordinal } from '../engine/thirdLegacy';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, annotationPlugin);

const IN_PERSON = '#2563eb';
const VIRTUAL = '#d97706';
const THRESHOLD = '#16a34a';
const LIMIT = '#dc2626';

function useThemeColors() {
  const read = () => {
    const cs = getComputedStyle(document.body);
    return {
      text: cs.getPropertyValue('--pico-color').trim() || '#333',
      grid: cs.getPropertyValue('--pico-muted-border-color').trim() || '#ccc',
    };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setC(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return c;
}

/** Stacked in-person + virtual bars for one ballot, with the two-thirds line. */
export function BallotChart({ position, result, large = false }: { position: Position; result: BallotResult; large?: boolean }) {
  const colors = useThemeColors();
  const ids = result.isConfirmation ? [...result.activeIds, AGAINST] : result.ranking;
  const labels = ids.map((id) => (result.isConfirmation && id !== AGAINST ? `Yes — ${nameOf(position, id)}` : nameOf(position, id)));
  const fontSize = large ? 22 : 13;

  const annotations: Record<string, object> = {
    twoThirds: {
      type: 'line',
      xMin: result.electThreshold,
      xMax: result.electThreshold,
      borderColor: THRESHOLD,
      borderWidth: 3,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `⅔ = ${result.electThreshold}`,
        position: 'start',
        backgroundColor: THRESHOLD,
        font: { size: fontSize - 1, weight: 'bold' },
      },
    },
  };
  if (result.withdrawalLimit !== null) {
    annotations.limit = {
      type: 'line',
      xMin: result.withdrawalLimit,
      xMax: result.withdrawalLimit,
      borderColor: LIMIT,
      borderWidth: 2,
      borderDash: [2, 3],
      label: {
        display: true,
        content: `${result.withdrawalRule === 'oneFifth' ? '⅕' : '⅓'} = ${fmtLimit(result.withdrawalLimit)}`,
        position: 'end',
        backgroundColor: LIMIT,
        font: { size: fontSize - 2 },
      },
    };
  }

  const max = Math.max(result.totalVote, result.electThreshold + 1, 1);
  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    scales: {
      x: { stacked: true, min: 0, max, ticks: { color: colors.text, font: { size: fontSize - 2 }, precision: 0 }, grid: { color: colors.grid } },
      y: { stacked: true, ticks: { color: colors.text, font: { size: fontSize, weight: 'bold' } }, grid: { display: false } },
    },
    plugins: {
      legend: { labels: { color: colors.text, font: { size: fontSize - 2 } } },
      tooltip: {
        callbacks: {
          footer: (items) => {
            const id = ids[items[0].dataIndex];
            const v = result.votes[id];
            return `Total ${v.total} of ${result.totalVote}`;
          },
        },
      },
      annotation: { annotations },
    },
  };

  const data = {
    labels,
    datasets: [
      { label: 'In-person', data: ids.map((id) => result.votes[id].inPerson), backgroundColor: IN_PERSON, borderRadius: 3 },
      { label: 'Virtual', data: ids.map((id) => result.votes[id].virtual), backgroundColor: VIRTUAL, borderRadius: 3 },
    ],
  };

  const height = Math.max(160, ids.length * (large ? 72 : 44) + 70);
  return (
    <figure className="chart" style={{ height }} aria-label={`${ordinal(result.number)} ballot results chart`}>
      <Bar data={data} options={options} />
    </figure>
  );
}
