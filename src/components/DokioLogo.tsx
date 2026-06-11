export default function DokioLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 250 250" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="250" height="250" rx="56" fill="#534AB7"/>
      <rect x="40" y="28" width="26" height="194" rx="8" fill="white"/>
      <path d="M66 28 Q210 28 210 125 Q210 222 66 222 L66 28" fill="white" opacity="0.92"/>
      <rect x="97" y="68" width="76" height="6" rx="3" fill="#534AB7" opacity="0.5"/>
      <rect x="97" y="90" width="92" height="6" rx="3" fill="#534AB7" opacity="0.5"/>
      <rect x="97" y="112" width="82" height="6" rx="3" fill="#534AB7" opacity="0.35"/>
      <rect x="97" y="134" width="60" height="6" rx="3" fill="#534AB7" opacity="0.35"/>
      <rect x="97" y="156" width="70" height="6" rx="3" fill="#534AB7" opacity="0.25"/>
    </svg>
  )
}
