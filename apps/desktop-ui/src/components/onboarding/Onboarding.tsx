import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { getSupabaseConfigurationError } from '../../services/supabaseClient';

export function Onboarding() {
  const { login, register, loginWithOAuth, isLoading, error, clearError } = useAuthStore();
  const { setOnboarded } = useAppStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const configurationError = getSupabaseConfigurationError();
  const displayedError = error === configurationError ? null : error;
  const submitDisabled = isLoading || Boolean(configurationError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      if (mode === 'register') {
        await register(email, password, name || email.split('@')[0]);
      } else {
        await login(email, password);
      }
      setOnboarded(true);
    } catch (err) {
      console.error('Authentication failed:', err);
    }
  }

  async function handleOAuth(provider: 'github' | 'google') {
    clearError();
    try {
      await loginWithOAuth(provider);
      // OAuth redirects the webview. If it returns successfully, 
      // the App component's useEffect will capture the session automatically.
    } catch (err) {
      console.error(`${provider} authentication failed:`, err);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Premium Sci-Fi Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-gray-900/60 border border-white/10 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl p-8 relative z-10">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 tracking-tight">MC Host</h1>
          <p className="text-sm text-gray-400 mt-2">
            {mode === 'login' ? 'Sign in to access your cloud servers' : 'Create an account to host your worlds'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  clearError();
                  setName(e.target.value);
                }}
                placeholder="Your name"
                className="w-full bg-gray-800/40 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                clearError();
                setEmail(e.target.value);
              }}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-800/40 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full bg-gray-800/40 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>

          {displayedError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {displayedError}
            </div>
          )}
          {configurationError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-medium">
              ⚠️ Note: {configurationError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full py-3 mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-semibold rounded-xl shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Sci-Fi Glassmorphism Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#111622] px-3.5 text-gray-500 font-semibold tracking-wider">
              Or continue with
            </span>
          </div>
        </div>

        {/* OAuth Social Buttons Container */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            disabled={submitDisabled}
            className="flex items-center justify-center gap-2.5 px-4 py-2.5 bg-gray-800/40 hover:bg-gray-800/90 border border-gray-700/50 hover:border-gray-600 rounded-xl font-medium text-sm text-gray-200 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span>GitHub</span>
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={submitDisabled}
            className="flex items-center justify-center gap-2.5 px-4 py-2.5 bg-gray-800/40 hover:bg-gray-800/90 border border-gray-700/50 hover:border-gray-600 rounded-xl font-medium text-sm text-gray-200 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Google</span>
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setMode('register');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline transition-all"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setMode('login');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline transition-all"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
