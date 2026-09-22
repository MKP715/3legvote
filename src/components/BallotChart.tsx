import { useEffect, useState } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, Legend, LinearScale, Tooltip, type ChartOptions } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import { AGAINST, type BallotResult, type Language, type Position } from '../engine/types';
import { nameOf } from '../announce';
import { fmtLimit } from '../engine/thirdLegacy';
import { ordinalL, t } from '../i18n';

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
    const on = () => setC(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', on);
    // The app's own light/dark switch sets data-theme on <html>.
    const observer = new MutationObserver(on);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      mq.removeEventListener('change', on);
      observer.disconnect();
    };
  }, []);
  return c;
}

/** Stacked in-person + virtual bars for one ballot, with the two-thirds line. */
export function BallotChart({
  position,
  result,
  large = false,
  lang = 'en',
}: {
  position: Position;
  result: BallotResult;
  large?: boolean;
  lang?: Language;
}) {
  const colors = useThemeColors();
  const d = t(lang);
  const ids = result.isConfirmation ? [...result.activeIds, AGAINST] : result.ranking;
  const labels = ids.map((id) => (result.isConfirmation && id !== AGAINST ? d.yesFor(nameOf(position, id, lang)) : nameOf(position, id, lang)));
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
            return `${v.total} / ${result.totalVote}`;
          },
        },
      },
      annotation: { annotations },
    },
  };

  const data = {
    labels,
    datasets: [
      { label: d.inPerson, data: ids.map((id) => result.votes[id].inPerson), backgroundColor: IN_PERSON, borderRadius: 3 },
      { label: d.virtual, data: ids.map((id) => result.votes[id].virtual), backgroundColor: VIRTUAL, borderRadius: 3 },
    ],
  };

  const height = Math.max(160, ids.length * (large ? 72 : 44) + 70);
  return (
    <figure className="chart" style={{ height }} aria-label={`${ordinalL(result.number, lang)} — ${d.totalVoteLabel} ${result.totalVote}`}>
      <Bar data={data} options={options} />
    </figure>
  );
}
