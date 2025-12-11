import React, { useState, useEffect, useRef } from 'react';
import { Toast } from './components/Toast';
import { db, auth, initError } from './firebase';
import { ref, onValue, set, push, query, limitToLast, orderByKey } from 'firebase/database';
import { signInWithEmailAndPassword } from 'firebase/auth';

// ============================================================
// 🔐 CONFIG TYPES
// ============================================================

interface AppConfig {
    tasa: number;
    whatsapp: string;
    nombreNegocio: string;
    bankName: string;
    bankCode: string;
    cedula: string;
    telefono: string;
    themeColor: string;
    lastUpdate: number;
    googleScriptUrl: string;
}

interface Transaction {
    id: string;
    date: string; // ISO String
    amountUSD: number;
    amountBs: string;
    reference: string;
    photoUrl?: string;
    timestamp: number;
}

// Configuración por defecto con tu URL de Script
const DEFAULT_CONFIG: AppConfig = {
    tasa: 60.00,
    whatsapp: "584129855266",
    nombreNegocio: "Inversiones GSKY",
    bankName: "Banesco",
    bankCode: "0134",
    cedula: "14866713",
    telefono: "04129855266",
    themeColor: "#20963b",
    lastUpdate: Date.now(),
    googleScriptUrl: "https://script.google.com/macros/s/AKfycbwjeRpKBlmUcj5hG-n4d3VyYnQXghBNMqW_yRO1g_yuW57l97mnfhq-V3SEBZqzvAxZRw/exec" 
};

function adjustColor(color: string, amount: number) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function App() {
    // ======================== STATE ========================
    const [isLoading, setIsLoading] = useState(true);
    const [configError, setConfigError] = useState<string | null>(null);
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

    // Calculator State
    const [amountUSD, setAmountUSD] = useState<string>('');
    const [amountBs, setAmountBs] = useState<string>('');
    const [reference, setReference] = useState<string>('');
    
    // Image State
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // UI State
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false); // New: History View
    
    // Login State
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [loginError, setLoginError] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Admin Panel State
    const [editConfig, setEditConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [tasaInput, setTasaInput] = useState(''); 
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    
    // History Data
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; show: boolean }>({
        message: '',
        type: 'info',
        show: false
    });
    
    const [errors, setErrors] = useState({ amount: false, reference: false });

    // Refs
    const amountInputRef = useRef<HTMLInputElement>(null);
    const referenceInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ======================== EFFECTS ========================

    const updateTheme = (colorHex: string) => {
        const root = document.documentElement;
        const dark = adjustColor(colorHex, -20);
        const darker = adjustColor(colorHex, -40);
        const shadow = hexToRgba(colorHex, 0.2);

        root.style.setProperty('--color-primary', colorHex);
        root.style.setProperty('--color-primary-dark', dark);
        root.style.setProperty('--color-primary-darker', darker);
        root.style.setProperty('--color-primary-light', '#f3f4f6'); 
        root.style.setProperty('--color-primary-lighter', '#f9fafb'); 
        root.style.setProperty('--shadow-color', shadow);
    };

    useEffect(() => {
        if (initError) {
            setConfigError(initError);
            setIsLoading(false);
            return;
        }
        if (!db) {
            setConfigError("No se pudo conectar a la base de datos.");
            setIsLoading(false);
            return;
        }

        const configRef = ref(db, 'config');
        const unsubscribe = onValue(configRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const mergedConfig = { ...DEFAULT_CONFIG, ...data };
                setConfig(mergedConfig);
                updateTheme(mergedConfig.themeColor || DEFAULT_CONFIG.themeColor);
            }
        });

        const timer = setTimeout(() => {
            setIsLoading(false);
            setTimeout(() => amountInputRef.current?.focus(), 500);
        }, 2500);

        return () => {
            unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        if (amountUSD && !isNaN(parseFloat(amountUSD))) {
            const calculated = parseFloat(amountUSD) * config.tasa;
            setAmountBs(calculated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
    }, [config.tasa]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // ======================== LOGIC ========================

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type, show: true });
        setTimeout(() => {
            setToast(prev => ({ ...prev, show: false }));
        }, 3000);
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmountUSD(value);
        setErrors(prev => ({ ...prev, amount: false }));

        if (value && !isNaN(parseFloat(value))) {
            const calculated = parseFloat(value) * config.tasa;
            setAmountBs(calculated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        } else {
            setAmountBs('');
        }
    };

    const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
        setReference(value);
        setErrors(prev => ({ ...prev, reference: false }));
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showToast("La imagen es muy grande (Max 5MB)", "error");
                return;
            }
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast(`${label} copiado`, 'success');
        }).catch(() => {
            showToast('Error al copiar', 'error');
        });
    };

    const formatCedula = (ced: string) => {
        if (!ced) return '';
        return `V-${parseInt(ced).toLocaleString('es-VE')}`;
    };

    const formatPhone = (phone: string) => {
        if (!phone) return '';
        if (phone.length === 11) {
            return `${phone.substring(0, 4)}-${phone.substring(4)}`;
        }
        return phone;
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                let encoded = reader.result as string;
                encoded = encoded.split(',')[1]; 
                resolve(encoded);
            };
            reader.onerror = error => reject(error);
        });
    };

    const uploadImageToDrive = async (file: File): Promise<string | null> => {
        if (!config.googleScriptUrl) {
            showToast("Error: Falta URL de Script", "error");
            return null;
        }
        try {
            const base64Content = await fileToBase64(file);
            const payload = {
                filename: `pago_${Date.now()}_${file.name}`,
                mimeType: file.type,
                file: base64Content
            };
            const response = await fetch(config.googleScriptUrl, {
                method: "POST",
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.result === "success") return data.url;
            return null;
        } catch (error) {
            console.error("Upload Error:", error);
            return null;
        }
    };

    const handleNotifyPayment = async () => {
        const usd = parseFloat(amountUSD);
        let hasError = false;
        const newErrors = { amount: false, reference: false };

        if (!amountUSD || isNaN(usd) || usd <= 0) {
            newErrors.amount = true;
            hasError = true;
            if (amountInputRef.current) amountInputRef.current.focus();
        }

        if (reference.length !== 4) {
            newErrors.reference = true;
            if (!hasError && referenceInputRef.current) referenceInputRef.current.focus();
            hasError = true;
        }

        setErrors(newErrors);
        if (hasError) {
            showToast('Por favor completa todos los campos', 'error');
            return;
        }

        setIsUploading(true);
        let imageUrl = "";

        // 1. Upload Image (if exists)
        if (selectedFile) {
            const uploadedLink = await uploadImageToDrive(selectedFile);
            if (!uploadedLink) {
                showToast("Error subiendo imagen. Verifica tu conexión.", "error");
                setIsUploading(false);
                return;
            }
            imageUrl = uploadedLink;
        }

        // 2. Save Transaction to Firebase
        if (db) {
            try {
                const paymentsRef = ref(db, 'payments');
                const newPayment = {
                    date: new Date().toISOString(),
                    amountUSD: usd,
                    amountBs: amountBs,
                    reference: reference,
                    photoUrl: imageUrl || null,
                    timestamp: Date.now()
                };
                // Push sin await bloqueante extremo, pero asegurando el envío
                await push(paymentsRef, newPayment);
            } catch (err) {
                console.error("Error saving payment record:", err);
                // No bloqueamos el flujo de WhatsApp si falla el guardado interno,
                // pero es bueno saberlo.
            }
        }

        setIsUploading(false);

        // 3. Send WhatsApp
        const fecha = new Date().toLocaleDateString('es-VE');
        const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
        const tasaFmt = config.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 });
        const usdFmt = usd.toLocaleString('es-VE', { minimumFractionDigits: 2 });

        let mensaje = `PAGO MOVIL - ${config.nombreNegocio}
📅 ${fecha} ${hora}

💵 ${usdFmt} USD (Tasa: ${tasaFmt})
✅ ${amountBs} Bs

🔢 Ref: ${reference}`;

        if (imageUrl) {
            mensaje += `\n\n📷 FOTO: ${imageUrl}`;
        }

        const url = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
        showToast('Abriendo WhatsApp...', 'success');
    };

    // ======================== ADMIN LOGIC ========================

    const openLogin = () => {
        setIsMenuOpen(false);
        setLoginUser('');
        setLoginPass('');
        setLoginError(false);
        setShowLoginModal(true);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setLoginError(false);
        
        const cleanEmail = loginUser.trim();
        const cleanPass = loginPass;

        if (!cleanEmail || !cleanPass) {
            showToast("Completa los campos", "error");
            setIsLoggingIn(false);
            return;
        }
        if (!auth) {
            showToast("Firebase Auth no disponible", "error");
            setIsLoggingIn(false);
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
            enterSettings();
            showToast("Sesión iniciada", "success");
        } catch (error: any) {
            console.error("Login error:", error);
            setLoginError(true);
            showToast("Credenciales incorrectas", "error");
        } finally {
            setIsLoggingIn(false);
        }
    };

    const enterSettings = () => {
        setShowLoginModal(false);
        setEditConfig(config);
        setTasaInput(config.tasa.toString());
        setShowSettings(true);
    };

    const saveSettings = async () => {
        if (!db) return;
        setIsSaving(true);
        setSaveSuccess(false);

        try {
            const finalTasa = parseFloat(tasaInput) || 0;
            const newConfig: AppConfig = { 
                ...editConfig, 
                tasa: finalTasa,
                lastUpdate: Date.now()
            };
            const configRef = ref(db, 'config');
            await set(configRef, newConfig);
            updateTheme(newConfig.themeColor);
            setSaveSuccess(true);
            setTimeout(() => {
                setShowSettings(false);
                setSaveSuccess(false);
                showToast("Configuración actualizada", "success");
            }, 1500);
        } catch (error) {
            showToast("Error al guardar en Firebase", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const fetchHistory = () => {
        if (!db) return;
        setIsLoadingHistory(true);
        setShowHistory(true);
        
        // Obtener los últimos 50 pagos
        const paymentsQuery = query(ref(db, 'payments'), orderByKey(), limitToLast(50));
        
        onValue(paymentsQuery, (snapshot) => {
            const data = snapshot.val();
            const list: Transaction[] = [];
            if (data) {
                Object.keys(data).forEach(key => {
                    list.push({ id: key, ...data[key] });
                });
                // Ordenar del más reciente al más antiguo
                list.sort((a, b) => b.timestamp - a.timestamp);
            }
            setTransactions(list);
            setIsLoadingHistory(false);
        }, { onlyOnce: true });
    };

    // ======================== RENDER ========================

    if (configError) {
        return (
             <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-8 text-center z-[200]">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                    <span className="text-4xl">⚠️</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuración Requerida</h1>
                <p className="text-red-500 font-bold mb-2">Error: {configError}</p>
                <button onClick={() => window.location.reload()} className="mt-8 px-6 py-3 bg-gray-900 text-white rounded-xl">Recargar Página</button>
            </div>
        );
    }

    return (
        <>
            {/* LOADER */}
            <div className={`fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center transition-all duration-700 ease-in-out ${isLoading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none translate-y-[-20px]'}`}>
                <div className="relative flex flex-col items-center">
                    <div className="w-20 h-20 mb-6 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center shadow-lg animate-bounce transition-colors duration-500">
                        <svg className="w-10 h-10 fill-white" viewBox="0 0 24 24">
                             <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                    </div>
                    <div className="text-center">
                        <p className="text-sm uppercase tracking-[0.3em] text-text-light font-medium mb-1 animate-pulse">Inversiones</p>
                        <h1 className="text-4xl font-extrabold text-text tracking-tighter">GSKY</h1>
                    </div>
                    <div className="mt-8 w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-[wiggle_1s_ease-in-out_infinite] transition-colors duration-500"></div>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className={`w-full transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100 animate-fadeInUp'}`}>
                <div className="bg-white rounded-3xl shadow-card overflow-hidden border border-white/80">
                    <header className="relative bg-gradient-to-br from-primary to-primary-dark p-6 sm:p-7 text-center text-white overflow-hidden transition-colors duration-500">
                        <div className="absolute -top-1/2 -right-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_60%)] pointer-events-none"></div>
                        <button onClick={() => setIsMenuOpen(true)} className="absolute top-6 right-6 z-20 p-2 text-white/80 hover:text-white transition-colors">
                            <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                        </button>
                        <div className="relative z-10">
                            <div className="w-[70px] h-[70px] bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
                                <svg className="w-9 h-9 fill-white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                            </div>
                            <h1 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">PAGO MÓVIL</h1>
                            <p className="text-sm opacity-90 font-normal uppercase tracking-wider">{config.nombreNegocio}</p>
                        </div>
                    </header>

                    <main className="p-5 sm:p-6">
                        {/* Rate */}
                        <div className="mb-6">
                            <div className="relative bg-gradient-to-br from-primary-light to-primary-lighter border border-primary/20 rounded-2xl p-4 text-center overflow-hidden select-none shadow-sm transition-colors duration-500">
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl opacity-30 grayscale contrast-50">💱</div>
                                <p className="text-[0.7rem] text-primary-dark uppercase tracking-widest font-semibold mb-1 transition-colors duration-500">📊 Tasa de Cambio del Día</p>
                                <p className="text-2xl font-extrabold text-primary tracking-tight transition-colors duration-500">1 USD = {config.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                            </div>
                            {config.lastUpdate && (Date.now() - config.lastUpdate > 86400000) && (
                                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeInUp">
                                    <div className="flex items-start gap-2 text-left">
                                        <span className="text-lg leading-none">⚠️</span>
                                        <p className="text-[11px] leading-tight text-amber-900/80 font-medium">La tasa no ha cambiado en las últimas 24h. Se recomienda verificar.</p>
                                    </div>
                                    <button onClick={() => window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(`Hola ${config.nombreNegocio}, ¿la tasa de ${config.tasa} Bs sigue vigente?`)}`, '_blank')} className="shrink-0 w-full sm:w-auto px-4 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Preguntar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* USD Input */}
                        <div className="mb-5 animate-fadeInUp [animation-delay:100ms] fill-mode-backwards">
                            <label className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary mb-2 ml-1"><span className="text-base">💵</span> Monto en Dólares</label>
                            <div className="relative group">
                                <input ref={amountInputRef} type="number" value={amountUSD} onChange={handleAmountChange} className={`w-full h-14 pl-[60px] pr-4 border-2 rounded-xl text-lg font-bold text-text bg-white transition-all outline-none ${errors.amount ? 'border-red-500 bg-red-50 animate-shake' : 'border-gray-200 group-hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10'}`} placeholder="0.00" min="0" step="0.01" inputMode="decimal" />
                                <div className={`absolute left-[2px] top-[2px] bottom-[2px] w-12 flex items-center justify-center rounded-l-[10px] border-r border-gray-100 font-bold text-lg transition-colors ${errors.amount ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-text-secondary'}`}>$</div>
                            </div>
                        </div>

                        {/* Bs Input */}
                        <div className="mb-5 animate-fadeInUp [animation-delay:200ms] fill-mode-backwards">
                            <label className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary mb-2 ml-1"><span className="text-base">💰</span> Monto a Transferir en Bolívares</label>
                            <div className="relative group">
                                <input type="text" value={amountBs} readOnly tabIndex={-1} className={`w-full h-14 pl-[60px] pr-12 border-2 rounded-xl text-lg font-bold transition-all outline-none ${amountBs ? 'border-primary bg-primary-lighter text-primary-darker' : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'}`} placeholder="0.00" />
                                <div className={`absolute left-[2px] top-[2px] bottom-[2px] w-12 flex items-center justify-center rounded-l-[10px] border-r border-transparent font-bold text-sm pointer-events-none transition-colors ${amountBs ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-400'}`}>Bs</div>
                                {amountBs && (
                                    <button onClick={() => copyToClipboard(amountBs, 'Monto en Bs')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-primary hover:bg-primary/10 active:scale-95 transition-all" title="Copiar monto">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div className="bg-bg rounded-2xl p-4 sm:p-5 mb-5 border border-bg-alt animate-fadeInUp [animation-delay:300ms] fill-mode-backwards">
                            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-dashed border-gray-300">
                                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-colors duration-500">
                                    <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z"/></svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-[0.95rem] font-bold text-text leading-tight">Datos para Pago Móvil</h3>
                                    <span className="text-xs text-text-light">Transferencia inmediata</span>
                                </div>
                            </div>
                            <div className="grid gap-2.5">
                                <div className="flex justify-between items-center p-3 px-3.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                                    <span className="text-xs text-text-light font-medium uppercase tracking-wide">Banco</span>
                                    <span className="text-sm font-bold text-text font-mono">{config.bankName} ({config.bankCode})</span>
                                </div>
                                <div className="flex justify-between items-center p-2 pl-3.5 pr-1.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                                    <span className="text-xs text-text-light font-medium uppercase tracking-wide">Cédula</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-text font-mono">{formatCedula(config.cedula)}</span>
                                        <button onClick={() => copyToClipboard(config.cedula, 'Cédula')} className="p-1.5 rounded-lg hover:bg-primary-light text-gray-400 hover:text-primary transition-colors active:scale-95">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-2 pl-3.5 pr-1.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                                    <span className="text-xs text-text-light font-medium uppercase tracking-wide">Teléfono</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-text font-mono">{formatPhone(config.telefono)}</span>
                                        <button onClick={() => copyToClipboard(config.telefono, 'Teléfono')} className="p-1.5 rounded-lg hover:bg-primary-light text-gray-400 hover:text-primary transition-colors active:scale-95">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Reference Input */}
                        <div className="mb-5 animate-fadeInUp [animation-delay:350ms] fill-mode-backwards">
                            <label className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary mb-2 ml-1"><span className="text-base">🔢</span> Últimos 4 dígitos de la referencia</label>
                            <input ref={referenceInputRef} type="text" value={reference} onChange={handleReferenceChange} maxLength={4} inputMode="numeric" pattern="[0-9]*" className={`w-full h-14 text-center tracking-[8px] font-mono border-2 rounded-xl text-2xl font-bold text-text bg-white transition-all outline-none ${errors.reference ? 'border-red-500 bg-red-50 animate-shake' : 'border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10'}`} placeholder="0000" autoComplete="off" />
                        </div>

                        {/* Image Input */}
                        <div className="mb-6 animate-fadeInUp [animation-delay:380ms] fill-mode-backwards">
                            <label className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary mb-2 ml-1"><span className="text-base">📸</span> Comprobante (Opcional)</label>
                            {!previewUrl ? (
                                <div onClick={() => fileInputRef.current?.click()} className="w-full h-16 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-white hover:border-primary/50 transition-all flex items-center justify-center gap-2 cursor-pointer group">
                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className="text-sm font-medium text-gray-500 group-hover:text-primary">Adjuntar Capture</span>
                                </div>
                            ) : (
                                <div className="relative w-full h-32 rounded-xl overflow-hidden border border-gray-200 group">
                                    <img src={previewUrl} alt="Comprobante" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={clearFile} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                    </div>
                                </div>
                            )}
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
                        </div>

                        {/* Submit Btn */}
                        <button onClick={handleNotifyPayment} disabled={isUploading} className={`group relative flex items-center justify-center gap-3 w-full py-4 sm:py-[18px] px-6 bg-gradient-to-br from-whatsapp to-whatsapp-dark text-white rounded-xl font-bold text-base shadow-[0_4px_14px_rgba(37,211,102,0.4)] hover:shadow-[0_8px_25px_rgba(37,211,102,0.5)] transition-all overflow-hidden animate-fadeInUp [animation-delay:400ms] fill-mode-backwards touch-manipulation ${isUploading ? 'opacity-90 cursor-wait' : 'hover:-translate-y-0.5 active:translate-y-0'}`}>
                            {isUploading ? (
                                <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span><span>Procesando...</span></>
                            ) : (
                                <><svg className="w-[26px] h-[26px] fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>Notificar Pago por WhatsApp</>
                            )}
                        </button>
                    </main>
                    
                    <footer className="p-5 sm:p-6 border-t border-bg-alt bg-bg">
                        <div className="flex flex-wrap items-center justify-center gap-5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-light/80 uppercase tracking-wide"><svg className="w-4 h-4 fill-green-500" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>Seguro</div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-light/80 uppercase tracking-wide"><svg className="w-4 h-4 fill-green-500" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Rápido</div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-light/80 uppercase tracking-wide"><svg className="w-4 h-4 fill-green-500" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Verificado</div>
                        </div>
                    </footer>
                </div>
                <p className="text-center mt-5 text-xs text-text-muted font-medium">{config.nombreNegocio} • Todos los derechos reservados</p>
                <Toast message={toast.message} type={toast.type} show={toast.show} />
            </div>

            {/* MENU */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-40 flex justify-end">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="relative w-64 h-full bg-white shadow-2xl p-6 flex flex-col items-center animate-[slideIn_0.3s_ease-out]">
                        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
                        <button onClick={() => setIsMenuOpen(false)} className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        <div className="mt-20">
                            <button onClick={openLogin} className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-text-secondary hover:bg-primary hover:text-white transition-all duration-300 shadow-md hover:rotate-90 hover:scale-110">
                                <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LOGIN MODAL */}
            {showLoginModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLoginModal(false)}></div>
                    <div className="relative bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl animate-[fadeInUp_0.3s_ease-out] overflow-hidden">
                        <h2 className="text-xl font-bold text-center mb-6 text-text">Acceso Admin</h2>
                        <form onSubmit={handleLogin}>
                            <div className="space-y-4">
                                <div><label className="block text-xs font-semibold text-text-light mb-1 uppercase">Correo</label><input type="email" value={loginUser} onChange={e => setLoginUser(e.target.value)} className="w-full p-3 border rounded-lg bg-bg focus:border-primary outline-none transition-colors" placeholder="admin@ejemplo.com"/></div>
                                <div><label className="block text-xs font-semibold text-text-light mb-1 uppercase">Contraseña</label><input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} className="w-full p-3 border rounded-lg bg-bg focus:border-primary outline-none transition-colors" placeholder="••••••••"/></div>
                            </div>
                            <button type="submit" disabled={isLoggingIn} className="w-full mt-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-70 flex justify-center shadow-lg shadow-primary/20">{isLoggingIn ? '...' : 'Entrar'}</button>
                        </form>
                        <button onClick={() => setShowLoginModal(false)} className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                    </div>
                </div>
            )}

            {/* SETTINGS PANEL */}
            {showSettings && (
                <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col animate-[fadeInUp_0.3s_ease-out]">
                    <div className="bg-white px-5 py-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-800">Configuración Global</h2>
                        <button onClick={() => setShowSettings(false)} className="text-text-light hover:text-text font-medium text-sm">Cerrar</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 settings-scroll">
                        <div className="max-w-md mx-auto space-y-6 pb-6">
                            
                            {/* Dashboard Button */}
                            <button 
                                onClick={fetchHistory}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                <span className="font-bold">Ver Historial de Transacciones</span>
                            </button>

                            {/* Settings Form */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><span className="text-lg">🎨</span> Color del Tema</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    {[{ hex: '#20963b', name: 'Verde' }, { hex: '#2563EB', name: 'Azul' }, { hex: '#7C3AED', name: 'Morado' }, { hex: '#DB2777', name: 'Rosa' }, { hex: '#DC2626', name: 'Rojo' }, { hex: '#D97706', name: 'Ámbar' }, { hex: '#000000', name: 'Negro' }].map((c) => (
                                        <button key={c.hex} onClick={() => setEditConfig(prev => ({ ...prev, themeColor: c.hex }))} className={`h-12 rounded-xl flex items-center justify-center transition-transform hover:scale-105 ${editConfig.themeColor === c.hex ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c.hex }}>
                                            {editConfig.themeColor === c.hex && <span className="text-white font-bold drop-shadow-md">✓</span>}
                                        </button>
                                    ))}
                                    <div className="relative h-12 rounded-xl overflow-hidden border border-gray-200"><input type="color" value={editConfig.themeColor} onChange={(e) => setEditConfig(prev => ({ ...prev, themeColor: e.target.value }))} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"/><div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-gray-500 bg-white/50 backdrop-blur-sm">Otro</div></div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><span className="text-lg">💱</span> Tasa de Cambio</h3>
                                <div className="relative"><input type="text" inputMode="decimal" value={tasaInput} onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setTasaInput(e.target.value); }} className="w-full p-4 border-2 border-primary/20 rounded-xl text-xl font-bold text-primary focus:border-primary outline-none bg-gray-50 focus:bg-white transition-colors" placeholder="0.00"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">Bs/USD</span></div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><span className="text-lg">🏢</span> Negocio</h3>
                                <div className="space-y-4">
                                    <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Nombre</label><input type="text" value={editConfig.nombreNegocio} onChange={e => setEditConfig({...editConfig, nombreNegocio: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                    <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">WhatsApp (Reportes)</label><input type="text" value={editConfig.whatsapp} onChange={e => setEditConfig({...editConfig, whatsapp: e.target.value.replace(/[^0-9]/g, '')})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none font-mono text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><span className="text-lg">🏦</span> Datos Bancarios</h3>
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <div className="flex-1"><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Banco</label><input type="text" value={editConfig.bankName} onChange={e => setEditConfig({...editConfig, bankName: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                        <div className="w-24"><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Código</label><input type="text" value={editConfig.bankCode} onChange={e => setEditConfig({...editConfig, bankCode: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none text-center text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                    </div>
                                    <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Cédula</label><input type="text" value={editConfig.cedula} onChange={e => setEditConfig({...editConfig, cedula: e.target.value.replace(/[^0-9]/g, '')})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none font-mono text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                    <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Teléfono Pago</label><input type="text" value={editConfig.telefono} onChange={e => setEditConfig({...editConfig, telefono: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none font-mono text-gray-800 bg-gray-50 focus:bg-white transition-colors"/></div>
                                </div>
                            </div>
                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><span className="text-lg">☁️</span> API Fotos</h3>
                                <input type="text" value={editConfig.googleScriptUrl} onChange={e => setEditConfig({...editConfig, googleScriptUrl: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:border-primary outline-none text-xs font-mono text-gray-600 bg-gray-50 focus:bg-white transition-colors" placeholder="https://script.google.com/..."/>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-5 border-t border-gray-200 flex gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                        <button onClick={() => setShowSettings(false)} className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors" disabled={isSaving}>Cancelar</button>
                        <button onClick={saveSettings} disabled={isSaving || saveSuccess} className={`flex-1 py-3.5 rounded-xl text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-all duration-300 ${saveSuccess ? 'bg-green-500 scale-105' : isSaving ? 'bg-primary-dark cursor-wait' : 'bg-primary hover:bg-primary-dark shadow-primary/30'}`}>{saveSuccess ? (<><span>¡Guardado!</span></>) : isSaving ? (<><span>Guardando...</span></>) : (<span>Guardar Cambios</span>)}</button>
                    </div>

                    {/* HISTORY OVERLAY */}
                    {showHistory && (
                        <div className="fixed inset-0 z-[70] bg-gray-100 flex flex-col animate-[fadeInUp_0.3s_ease-out]">
                            <div className="bg-white px-5 py-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
                                <h2 className="text-lg font-bold text-gray-800">Historial de Operaciones</h2>
                                <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-900 font-medium text-sm">Cerrar</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                {isLoadingHistory ? (
                                    <div className="flex justify-center mt-10"><span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></span></div>
                                ) : transactions.length === 0 ? (
                                    <div className="text-center mt-10 text-gray-400">No hay transacciones registradas aún.</div>
                                ) : (
                                    <div className="max-w-xl mx-auto space-y-3">
                                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-2 pl-1">Últimos {transactions.length} registros</div>
                                        {transactions.map((tx) => (
                                            <div key={tx.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-xs text-gray-400 font-mono mb-1">{new Date(tx.date).toLocaleDateString('es-VE')} • {new Date(tx.date).toLocaleTimeString('es-VE', {hour:'2-digit', minute:'2-digit'})}</div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-mono font-bold">Ref: {tx.reference}</span>
                                                            {tx.photoUrl && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-bold">📷 Foto</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-bold text-gray-900">${tx.amountUSD.toLocaleString('es-VE', {minimumFractionDigits:2})}</div>
                                                        <div className="text-sm font-semibold text-green-600">{tx.amountBs} Bs</div>
                                                    </div>
                                                </div>
                                                {tx.photoUrl && (
                                                    <a href={tx.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-center w-full py-2 bg-gray-50 hover:bg-gray-100 text-blue-600 text-sm font-bold rounded-lg border border-gray-200 transition-colors">
                                                        Ver Comprobante
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}