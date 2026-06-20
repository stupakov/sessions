// Render text with any runs of digits in bold (used for filenames in the
// Open/Play dropdowns so version numbers stand out).
export default function BoldDigits({ text }) {
  const parts = String(text ?? '').split(/(\d+)/)
  return (
    <>
      {parts.map((p, i) =>
        /^\d+$/.test(p) ? (
          <strong key={i} className="font-bold">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
