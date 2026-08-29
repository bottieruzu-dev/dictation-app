"use client";

interface Monster {
  id: number;
  name: string;
  name_en: string;
  rarity: number;
  image_url: string;
  quote_ja: string;
}

interface Props {
  isOpen: boolean;
  monster: Monster | null;
  onClose: () => void;
}

export default function ClipGachaModal({ isOpen, monster, onClose }: Props) {
  if (!isOpen || !monster) return null;

  const getRarityBg = (r: number) => {
    switch (r) {
      case 5: return "from-amber-500 via-purple-600 to-indigo-700 border-amber-300";
      case 4: return "from-yellow-500 via-amber-600 to-orange-600 border-yellow-300";
      case 3: return "from-blue-500 to-indigo-700 border-blue-300";
      case 2: return "from-green-500 to-teal-700 border-green-300";
      default: return "from-gray-500 to-gray-700 border-gray-300";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="max-w-sm w-full text-center space-y-6 text-white relative">
        
        {/* 出現カットインタイトル */}
        <div className="space-y-1">
          <span className="bg-gradient-to-r from-amber-400 to-yellow-200 text-black font-black px-4 py-1 rounded-full text-xs uppercase tracking-widest shadow-lg animate-bounce inline-block">
            ✨ クリップモンスター出現！
          </span>
          <h2 className="text-2xl font-black text-amber-300 drop-shadow-md">
            {monster.name} が出現！
          </h2>
        </div>

        {/* モンスターカード風演出 */}
        <div className={`p-1.5 rounded-2xl bg-gradient-to-b ${getRarityBg(monster.rarity)} shadow-2xl transition-transform hover:scale-105`}>
          <div className="bg-gray-950 rounded-xl p-5 space-y-4">
            
            <div className="text-center">
              <span className="text-lg text-amber-400 tracking-widest font-black">
                {"★".repeat(monster.rarity)}
              </span>
            </div>

            <div className="relative">
              <img
                src={monster.image_url}
                alt={monster.name}
                className="w-40 h-48 object-cover rounded-xl mx-auto border-2 border-gray-800 shadow-xl"
              />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white">{monster.name}</h3>
              <p className="text-xs text-gray-400 font-mono">{monster.name_en}</p>
            </div>

            <p className="text-xs italic text-cyan-300 bg-gray-900/80 p-2.5 rounded-lg border border-gray-800">
              "{monster.quote_ja}"
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-300 font-mono">
          このクリップのディクテーション問題を解いて<br />
          <span className="text-cyan-400 font-bold">ドロップ＆運極</span> を目指そう！
        </p>

        <button
          onClick={onClose}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-90 text-white font-black text-sm rounded-xl shadow-xl transition-all"
        >
          学習スタート画面へ ➔
        </button>

      </div>
    </div>
  );
}