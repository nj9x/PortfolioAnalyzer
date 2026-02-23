export default function EconomicIndicator({ name, value, date }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium">{name}</p>
      <p className="text-lg font-semibold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{date}</p>
    </div>
  )
}
