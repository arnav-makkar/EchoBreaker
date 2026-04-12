import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = { left: '#e53e3e', center: '#6b7280', right: '#3182ce' };

export default function DietChart({ sourceDiversity = {} }) {
  const data = [
    { name: 'Left',   key: 'left',   count: sourceDiversity.left || 0 },
    { name: 'Center', key: 'center', count: sourceDiversity.center || 0 },
    { name: 'Right',  key: 'right',  count: sourceDiversity.right || 0 },
  ];
  const total = data.reduce((a, b) => a + b.count, 0);

  if (total === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-4">
        No articles analyzed yet.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Your reading diet
      </h3>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              contentStyle={{ fontSize: 12, borderRadius: 4 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.key} fill={COLORS[d.key]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-gray-400 text-center mt-1">
        {total} article{total === 1 ? '' : 's'} analyzed
      </div>
    </div>
  );
}
