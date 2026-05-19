import { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Cpu, 
  Layers, 
  Globe, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Download, 
  Info, 
  FileText, 
  Server, 
  HelpCircle
} from 'lucide-react';
import { sendIPCCommand } from '../../services/ipcClient';

interface EnvData {
  java: {
    installed: boolean;
    version: string | null;
    path: string | null;
  };
  cloudflare: {
    installed: boolean;
    version: string | null;
  };
  minecraft: {
    official: {
      installed: boolean;
      path: string | null;
    };
    tlauncher: {
      installed: boolean;
      path: string | null;
    };
    legacy: {
      installed: boolean;
      path: string | null;
    };
    versions: string[];
  };
}

export function Guides() {
  const [activeTab, setActiveTab] = useState<'checker' | 'guides'>('checker');
  const [selectedGuide, setSelectedGuide] = useState<string>('server-setup');
  const [envData, setEnvData] = useState<EnvData | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function checkEnvironment() {
    setChecking(true);
    setError(null);
    try {
      const data = await sendIPCCommand<EnvData>('system.environment.check');
      setEnvData(data);
    } catch (err: any) {
      setError(err.message || 'Çevresel durum kontrolü başarısız oldu.');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkEnvironment();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-gray-900 border border-emerald-500/20 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-emerald-500" />
            Kılavuzlar ve Çevresel Kontrol
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Yerel Java, Cloudflare ve Minecraft kurulumlarınızı denetleyin; modpack, PaperMC ve sunucu yapılandırmalarını keşfedin.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex bg-gray-800/80 p-1 border border-gray-700/60 rounded-xl max-w-fit">
          <button
            onClick={() => setActiveTab('checker')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'checker'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-700/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Sistem Denetleyici
          </button>
          <button
            onClick={() => setActiveTab('guides')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'guides'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-700/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Nasıl Yapılır Rehberleri
          </button>
        </div>
      </div>

      {/* Tab 1: System Checker */}
      {activeTab === 'checker' && (
        <div className="space-y-6">
          {/* Action Row */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">Yerel Bileşen Durumları</h3>
            <button
              onClick={checkEnvironment}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Kontrol Ediliyor...' : 'Yeniden Denetle'}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Java Runtime Card */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                    <Server className="w-6 h-6" />
                  </div>
                  {envData?.java.installed ? (
                    <span className="px-2.5 py-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Yüklü
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-500/20 rounded-full flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Eksik
                    </span>
                  )}
                </div>
                <h4 className="text-lg font-bold text-gray-200">Java Runtime (JRE)</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Minecraft sunucu dosyalarını çalıştırabilmeniz için yerel bilgisayarınızda en az Java 17 veya üzeri yüklü olmalıdır.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700/40">
                {envData?.java.installed ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-gray-400">Yüklü Sürüm:</div>
                    <div className="text-sm font-semibold text-emerald-400 font-mono">{envData.java.version}</div>
                    <div className="text-[10px] text-gray-505 font-mono truncate hover:text-gray-300 transition-colors" title={envData.java.path || ''}>
                      {envData.java.path}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-rose-400 font-medium">Java kurulumu bulunamadı!</div>
                    <a
                      href="https://adoptium.net/temurin/releases/?version=17"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Java 17 İndir
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Cloudflare Tunnel Card */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                    <Globe className="w-6 h-6" />
                  </div>
                  {envData?.cloudflare.installed ? (
                    <span className="px-2.5 py-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Yüklü
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-semibold text-gray-400 bg-gray-950/40 border border-gray-750 rounded-full flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      İsteğe Bağlı
                    </span>
                  )}
                </div>
                <h4 className="text-lg font-bold text-gray-200">Cloudflare Tunnel (CLI)</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Özel proxy ağlarının yanı sıra HTTP/TCP port yönlendirmeleri veya ek web paneli erişimleri için `cloudflared` altyapısı kontrol edilir.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700/40">
                {envData?.cloudflare.installed ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-gray-400">Yüklü Sürüm:</div>
                    <div className="text-sm font-semibold text-blue-400 font-mono">{envData.cloudflare.version}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 leading-relaxed">
                      Sistemimiz yerel port yönlendirmesiz STUN/P2P tünellemesini zaten otomatik yapar. `cloudflared` kurulumu isteğe bağlıdır.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Minecraft Launchers Card */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Aktif
                  </span>
                </div>
                <h4 className="text-lg font-bold text-gray-200">Minecraft İstemcileri</h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Yerel sisteminizdeki Minecraft başlatıcıları (TLauncher, Orijinal, Legacy Launcher) taranarak tespit edilir.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700/40">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Orijinal Minecraft:</span>
                    <span className={`font-semibold ${envData?.minecraft.official.installed ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {envData?.minecraft.official.installed ? 'Bulundu' : 'Eksik'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">TLauncher:</span>
                    <span className={`font-semibold ${envData?.minecraft.tlauncher.installed ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {envData?.minecraft.tlauncher.installed ? 'Bulundu' : 'Eksik'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Legacy Launcher:</span>
                    <span className={`font-semibold ${envData?.minecraft.legacy.installed ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {envData?.minecraft.legacy.installed ? 'Bulundu' : 'Eksik'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Minecraft Detected Versions Grid */}
          {envData?.minecraft.versions && envData.minecraft.versions.length > 0 && (
            <div className="p-6 bg-gray-800/30 border border-gray-700/40 rounded-2xl">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-emerald-400" />
                Sisteminizde Tespit Edilen Minecraft Sürümleri ({envData.minecraft.versions.length})
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-3">
                {envData.minecraft.versions.map((ver) => (
                  <div key={ver} className="px-3 py-1.5 bg-gray-800/80 border border-gray-700/40 text-gray-300 font-mono text-center rounded-lg text-xs truncate" title={ver}>
                    {ver}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Knowledge Base Guides */}
      {activeTab === 'guides' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
          {/* Guide Sidebar */}
          <div className="space-y-1 bg-gray-800 p-3 border border-gray-700/40 rounded-2xl">
            <h4 className="text-xs font-bold text-gray-400 px-3 py-2 uppercase tracking-wider">Konu Listesi</h4>
            
            <button
              onClick={() => setSelectedGuide('server-setup')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                selectedGuide === 'server-setup'
                  ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Server className="w-4 h-4" />
              Kolay Sunucu Kurulumu
            </button>

            <button
              onClick={() => setSelectedGuide('curseforge-modpacks')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                selectedGuide === 'curseforge-modpacks'
                  ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              CurseForge & Modpack Kurulumu
            </button>

            <button
              onClick={() => setSelectedGuide('papermc-optimize')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                selectedGuide === 'papermc-optimize'
                  ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Cpu className="w-4 h-4" />
              PaperMC & Eklenti Rehberi
            </button>

            <button
              onClick={() => setSelectedGuide('tlauncher-connection')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                selectedGuide === 'tlauncher-connection'
                  ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              TLauncher & Bağlantı Sorunları
            </button>
          </div>

          {/* Guide Content Display */}
          <div className="md:col-span-3 bg-gray-850 border border-gray-700/50 rounded-2xl p-6 min-h-[400px]">
            {/* Guide: Server Setup */}
            {selectedGuide === 'server-setup' && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-200">1 Tıklama ile Sunucu Kurulum Kılavuzu</h3>
                <div className="w-12 h-1 bg-emerald-500 rounded-full" />
                
                <p className="text-sm text-gray-300 leading-relaxed">
                  MC Hosting Platformu, teknik detaylarla boğuşmadan saniyeler içinde Minecraft Vanilla ve PaperMC sunucuları kurmanızı sağlar.
                </p>

                <div className="space-y-3 mt-6">
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold font-mono">1</div>
                    <div>
                      <h4 className="font-bold text-gray-200 text-sm">Sunucu Oluşturma</h4>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Dashboard ekranındaki **"Create Server"** butonuna basın. Sunucunuza bir isim verin ve Java motorunu seçin (Vanilla veya PaperMC).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold font-mono">2</div>
                    <div>
                      <h4 className="font-bold text-gray-200 text-sm">RAM ve Sürüm Seçimi</h4>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Minecraft sürümünü (örneğin `1.20.4`) seçin. Sunucunuza atamak istediğiniz minimum ve maksimum bellek (RAM) miktarını gigabayt cinsinden girin.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold font-mono">3</div>
                    <div>
                      <h4 className="font-bold text-gray-200 text-sm">Sunucuyu Başlatma ve Erişim Kodu</h4>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Sunucuyu **"Start"** butonuna basarak başlatın. Sunucu açıldıktan sonra **"Access"** sekmesine geçin, bir **Davet Kodu (Invite Code)** oluşturun ve arkadaşlarınızla paylaşın!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 leading-relaxed mt-6">
                  💡 **İpucu:** Sunucu properties ayarlarını düzenlemek veya logları canlı izlemek için konsolu ve ayarlar sekmelerini kullanabilirsiniz.
                </div>
              </div>
            )}

            {/* Guide: CurseForge & Modpacks */}
            {selectedGuide === 'curseforge-modpacks' && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-200">CurseForge ve Modpack Kurulumu</h3>
                <div className="w-12 h-1 bg-emerald-500 rounded-full" />

                <p className="text-sm text-gray-300 leading-relaxed">
                  Sunucunuzda Forge/Fabric modları ya da devasa mod paketleri (RLCraft, Pixelmon vb.) çalıştırmak oldukça kolaydır.
                </p>

                <div className="space-y-4 mt-6">
                  <div className="bg-gray-800/60 p-4 border border-gray-700/40 rounded-xl space-y-2">
                    <h4 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-emerald-400" />
                      1. Adım: Mod Motorunun Sunucuya Kurulması
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Eğer bir mod paketi kuracaksanız öncelikle yerel veri dizininizdeki sunucu klasörüne gidin (**C:\Users\Kullanıcı\AppData\Roaming\MCHosting\servers\[sunucu-id]**). Sunucunun kurulu olduğu dizine Forge veya Fabric sunucu kurulum (.jar) dosyalarını kurup ana başlatıcı dosyasını sunucu klasöründeki `server.jar` dosyası ile değiştirin veya ayarlar sekmesinden bu dosyayı gösterin.
                    </p>
                  </div>

                  <div className="bg-gray-800/60 p-4 border border-gray-700/40 rounded-xl space-y-2">
                    <h4 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      2. Adım: Mods Klasörünün Aktarılması
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      CurseForge'dan indirdiğiniz mod paketindeki veya tekil modlardaki `mods` klasörünü kopyalayıp sunucu ana dizinine yapıştırın. Ek olarak, eğer mod paketi `config` klasörü içeriyorsa bu klasörü de sunucu klasörüne aktarın.
                    </p>
                  </div>

                  <div className="bg-gray-800/60 p-4 border border-gray-700/40 rounded-xl space-y-2">
                    <h4 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      3. Adım: İstemci Uyumluluğu
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Mod paketini oynayacak olan arkadaşlarınızın da aynı modları yerel Minecraft istemcilerine (Mods klasörüne) kurduğundan emin olun. CurseForge uygulaması üzerinden mod paketini kurup başlatmak en temiz çözümdür.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Guide: PaperMC Optimize */}
            {selectedGuide === 'papermc-optimize' && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-200">PaperMC ve Sunucu Optimizasyonu</h3>
                <div className="w-12 h-1 bg-emerald-500 rounded-full" />

                <p className="text-sm text-gray-300 leading-relaxed">
                  PaperMC, vanilya Minecraft sunucularına kıyasla olağanüstü performans iyileştirmeleri sağlayan ve zengin eklenti (Plugin) desteği sunan en popüler sunucu motorudur.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 bg-gray-850/50 border border-gray-700/30 rounded-xl">
                    <h4 className="font-bold text-gray-200 text-sm mb-2">TPS ve Lag Önleme</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      PaperMC, chunk yükleme algoritmalarını optimize eder, gereksiz yaratık (mob) yapay zekalarını sınırlar ve işlemci çekirdeklerini çok daha verimli kullanarak sunucu TPS değerini stabil olarak 20.0 civarında tutar.
                    </p>
                  </div>

                  <div className="p-4 bg-gray-850/50 border border-gray-700/30 rounded-xl">
                    <h4 className="font-bold text-gray-200 text-sm mb-2">Eklenti (Plugin) Ekleme</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Kurduğunuz PaperMC sunucusunun klasöründe otomatik olarak bir `plugins` klasörü oluşur. Indirdiğiniz eklenti (`.jar`) dosyalarını bu klasöre yapıştırıp sunucuyu yeniden başlatmanız yeterlidir. (Örn: WorldEdit, EssentialsX, Vault).
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2 mt-4">
                  <div className="text-xs font-bold text-emerald-400">💡 Performans Optimizasyon Tüyosu:</div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Sunucunuzun kurulu olduğu klasördeki `paper-global.yml` veya `spigot.yml` dosyalarını açarak `view-distance` (görüş mesafesi) değerini `6` veya `8` yapın. Bu ayar sunucu bellek ve CPU kullanımını muazzam ölçüde düşürür.
                  </p>
                </div>
              </div>
            )}

            {/* Guide: TLauncher */}
            {selectedGuide === 'tlauncher-connection' && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-200">TLauncher ve Offline-Mode Bağlantı Çözümü</h3>
                <div className="w-12 h-1 bg-emerald-500 rounded-full" />

                <p className="text-sm text-gray-300 leading-relaxed">
                  TLauncher veya orijinal olmayan Minecraft istemcileri üzerinden sunucunuza bağlanmaya çalışırken alınan **"Invalid session"** veya **"Giriş doğrulanamadı"** hatalarını çözmek için aşağıdaki adımları izleyin.
                </p>

                <div className="space-y-4 mt-6">
                  <div className="p-4 bg-amber-950/10 border border-amber-500/20 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Kritik Yapılandırma: Online Mode</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      TLauncher kullanan oyuncuların sunucunuza girebilmesi için sunucunun orijinal üyelik doğrulamasını (Mojang/Microsoft Session) kapatması gerekir:
                    </p>
                    <ol className="list-decimal list-inside text-xs text-gray-400 space-y-1.5 mt-2">
                      <li>Sunucunuzu tamamen durdurun.</li>
                      <li>**Settings (Ayarlar)** sekmesine gidin.</li>
                      <li>Sunucu Özellikleri panelinden **Online Mode** ayarını bulup **"Kapalı" (false)** olarak güncelleyin ve kaydedin.</li>
                      <li>Sunucunuzu yeniden başlatın.</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-gray-800/60 border border-gray-700/40 rounded-xl space-y-1">
                    <h4 className="text-sm font-bold text-gray-200">Arkadaşım Nasıl Bağlanacak?</h4>
                    <ul className="list-disc list-inside text-xs text-gray-400 space-y-1.5 mt-2">
                      <li>Arkadaşınız kendi MC Hosting uygulamasından sizin **Davet Kodunuzu (Invite Code)** kullanarak sunucunuza katılır.</li>
                      <li>Davet kodunu kullandıktan sonra, arkadaşınız TLauncher'ı açar ve Çok Oyunculu (Multiplayer) → Doğrudan Bağlan (Direct Connect) kısmına **`localhost:25566`** yazarak giriş yapar.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
