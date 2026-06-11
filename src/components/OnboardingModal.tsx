import { useNavigate } from 'react-router-dom'
import { ScanLine, X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function OnboardingModal({ onClose }: Props) {
  const navigate = useNavigate()

  const handleScan = () => {
    onClose()
    navigate('/scanner')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#222222] rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-[#333] rounded-lg transition-colors"
        >
          <X size={16} className="text-gray-400" />
        </button>

        {/* Icône animée */}
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 bg-paperliss-light rounded-2xl flex items-center justify-center">
            <ScanLine size={36} className="text-paperliss" />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-white animate-bounce" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Bienvenue sur Dokio ! 🎉
        </h2>
        <p className="text-gray-500 dark:text-[#AAAAAA] text-sm mb-6 leading-relaxed">
          Ton compte est prêt. Commence maintenant en scannant ton premier courrier —
          l'IA te dit exactement quoi faire en quelques secondes.
        </p>

        <button
          onClick={handleScan}
          className="w-full bg-paperliss hover:bg-paperliss-dark text-white font-bold py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 text-base shadow-lg shadow-paperliss/25"
        >
          <ScanLine size={20} />
          Scanne ton premier courrier !
        </button>

        <button
          onClick={onClose}
          className="w-full text-gray-400 hover:text-gray-600 text-sm mt-3 py-2"
        >
          Plus tard
        </button>
      </div>
    </div>
  )
}
