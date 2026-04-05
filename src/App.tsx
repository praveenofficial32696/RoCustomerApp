/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Droplets, 
  User, 
  Phone, 
  MapPin, 
  Pencil, 
  Power, 
  Clock, 
  Ticket, 
  CheckCircle2, 
  X, 
  ChevronRight, 
  History, 
  Calendar, 
  Wrench, 
  Plus, 
  AlertCircle,
  PhoneCall,
  UserCheck,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Download,
  Trash2,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  sendPasswordResetEmail,
  signInWithPopup,
  getAdditionalUserInfo,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  getDocFromServer,
  Timestamp,
  serverTimestamp,
  runTransaction,
  increment
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

type ServiceType = 'Service Request' | 'Installation' | 'Reinstallation';

interface Booking {
  id: string; // document ID
  bookingId: string;
  uid: string;
  bookedDate: Timestamp | string;
  createdAt: Timestamp | string;
  closedAt?: Timestamp | string;
  closedDate?: Timestamp | string; // added
  customerAddress: string;
  customerName: string;
  customerNumber: string;
  isComplaint: boolean;
  roModel: string;
  serviceType: ServiceType;
  status: 'open' | 'cancelled' | 'InProcess' | 'closed';
  technician: {
    name: string;
    phone: string;
  };
  billing?: {
    spareParts?: SparePart[];
    serviceFee?: number;
    discount?: number;
    totalAmount?: number;
    warranty?: string;
    paymentMethod?: 'Cash' | 'Online';
  };
}

interface UserProfile {
  name: string;
  email: string; // added
  phone: string;
  address: string;
  roModel: string;
  role: 'customer' | 'admin' | 'technician';
  createdAt: Timestamp;
}

interface SparePart {
  partName: string;
  price: number;
}

interface WorkHistory {
  id: string; // workId
  bookingId: string;
  cost: number;
  date: string;
  bookedDate?: string; // added
  description: string;
  spares: SparePart[];
  status: 'Closed' | 'Open';
  title: string;
  serviceType: string;
  technicianName: string;
  warranty?: string;
  uid: string;
  serviceFee?: number; // added
  discount?: number; // added
}

// --- Constants ---

const SERVICE_CHARGES: Record<ServiceType, number> = {
  'Service Request': 200,
  'Installation': 500,
  'Reinstallation': 375,
};

// --- Helper Functions ---

const formatBookingDate = (date: Timestamp | string | undefined) => {
  if (!date) return 'N/A';
  try {
    let d: Date;
    if (typeof date === 'string') {
      d = new Date(date);
    } else {
      d = (date as Timestamp).toDate();
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(date);
  }
};

const formatBookingDateOnly = (date: Timestamp | string | undefined) => {
  if (!date) return 'N/A';
  try {
    let d: Date;
    if (typeof date === 'string') {
      d = new Date(date);
    } else {
      d = (date as Timestamp).toDate();
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(date);
  }
};

// --- Components ---

const Toast = ({ message, visible, onHide }: { message: string; visible: boolean; onHide: () => void }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 700);
      
      const handleOutsideClick = (e: MouseEvent) => {
        onHide();
      };

      // Small delay to prevent the click that triggered the toast from immediately closing it
      const clickTimer = setTimeout(() => {
        window.addEventListener('click', handleOutsideClick);
      }, 10);

      return () => {
        clearTimeout(timer);
        clearTimeout(clickTimer);
        window.removeEventListener('click', handleOutsideClick);
      };
    }
  }, [visible, onHide]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20, x: '-50%' }}
          animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, scale: 0.9, y: 20, x: '-50%' }}
          onClick={(e) => e.stopPropagation()}
          className="fixed top-1/2 left-1/2 -translate-y-1/2 z-[100] bg-slate-900/95 text-white px-8 py-4 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col items-center gap-3 border border-white/20 backdrop-blur-xl min-w-[240px] text-center pointer-events-auto"
        >
          <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-blue-400" />
          </div>
          <span className="text-sm font-bold leading-tight">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Modal = ({ isOpen, onClose, title, children, hideCloseButton = false, maxWidth = "max-w-md" }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; hideCloseButton?: boolean; maxWidth?: string }) => {
  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm cursor-default"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white w-full ${maxWidth} rounded-[2rem] overflow-hidden shadow-2xl cursor-auto relative`}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">{title}</h3>
          {!hideCloseButton && (
            <button 
              onClick={onClose} 
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-90 border border-slate-200"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          )}
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </motion.div>
    </div>
  );
};


interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Application Error</h2>
            <p className="text-slate-500 text-sm leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 active:scale-[0.98]"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const AdminPanel = ({ bookings, technicians, onAssign, onCancel }: { bookings: Booking[]; technicians: UserProfile[]; onAssign: (bookingId: string, technician: { name: string; phone: string }) => void; onCancel: (id: string) => void }) => {
  const activeBookings = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'closed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-bold text-slate-800">Job Cards (Active Bookings)</h3>
        <span className="text-[11px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">
          {activeBookings.length} Total
        </span>
      </div>

      <div className="grid gap-4">
        {activeBookings.length === 0 ? (
          <div className="bg-white p-8 rounded-[2rem] text-center border border-slate-100">
            <Ticket className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No active bookings found.</p>
          </div>
        ) : (
          activeBookings.map(b => (
            <div key={b.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      b.status === 'open' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      b.status === 'InProcess' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {b.status}
                    </span>
                    {b.isComplaint && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-100 animate-pulse">
                        Complaint
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-slate-400">ID: {b.bookingId}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">{b.serviceType}</h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-widest mb-1">Created At</span>
                  <span className="text-xs font-bold text-slate-600">{formatBookingDateOnly(b.createdAt)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Customer</span>
                  <p className="text-sm font-bold text-slate-700">{b.customerName}</p>
                  <p className="text-[11px] text-slate-500">{b.customerNumber}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Service Date</span>
                  <p className="text-sm font-bold text-slate-700">{formatBookingDate(b.bookedDate)}</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Address</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{b.customerAddress || 'No address provided'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assign Technician</p>
                  <select 
                    value={b.technician?.name || ""}
                    onChange={(e) => {
                      const tech = technicians.find(t => t.name === e.target.value);
                      if (tech) {
                        onAssign(b.id, { name: tech.name, phone: tech.phone });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Select Technician</option>
                    {technicians.map(t => (
                      <option key={t.email} value={t.name}>{t.name} ({t.phone})</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={() => onCancel(b.id)}
                  className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer active:scale-95 whitespace-nowrap self-end mb-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const TechnicianPanel = ({ bookings, onCloseJob, onConfirmPayment }: { bookings: Booking[]; onCloseJob: (booking: Booking) => void; onConfirmPayment: (booking: Booking, method: 'Cash' | 'Online') => void }) => {
  const assignedBookings = bookings.filter(b => b.status === 'InProcess');
  const [paymentMethods, setPaymentMethods] = useState<Record<string, 'Cash' | 'Online'>>({});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-bold text-slate-800">My Assignments</h3>
        <span className="text-[11px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">
          {assignedBookings.length} Active
        </span>
      </div>

      <div className="grid gap-4">
        {assignedBookings.length === 0 ? (
          <div className="bg-white p-8 rounded-[2rem] text-center border border-slate-100">
            <BadgeCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No active assignments.</p>
          </div>
        ) : (
          assignedBookings.map(b => (
            <div key={b.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100">
                      {b.status}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">ID: {b.bookingId}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">{b.serviceType}</h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-widest mb-1">Customer</span>
                  <span className="text-xs font-bold text-slate-600">{b.customerName}</span>
                </div>
              </div>

              <div className="space-y-3 py-4 border-y border-slate-50">
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <p className="text-xs text-slate-600">{b.customerAddress}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <a href={`tel:${b.customerNumber}`} className="text-xs font-bold text-blue-600">{b.customerNumber}</a>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <p className="text-xs text-slate-600">{formatBookingDate(b.bookedDate)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Method:</p>
                  <div className="flex gap-2">
                    {['Cash', 'Online'].map((m) => (
                      <button
                        key={m}
                        onClick={() => setPaymentMethods(prev => ({ ...prev, [b.id]: m as 'Cash' | 'Online' }))}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          paymentMethods[b.id] === m 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      const method = paymentMethods[b.id];
                      if (!method) {
                        alert('Please select a payment method first');
                        return;
                      }
                      onConfirmPayment(b, method);
                    }}
                    className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    Confirm Payment
                  </button>
                  <button 
                    onClick={() => onCloseJob(b)}
                    className="flex-1 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark as Closed
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRoModel, setIsSavingRoModel] = useState(false);
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isComplaint, setIsComplaint] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    phone: '',
    address: '',
    roModel: '',
    role: 'customer',
    createdAt: Timestamp.now(),
  });

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [technicians, setTechnicians] = useState<UserProfile[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null); // Current active booking

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !isSigningUp && !isAuthLoading && !isGoogleLoading) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!userDoc.exists()) {
            await signOut(auth);
            showToast("User account does not exist. Please contact support.");
            setIsLoggedIn(false);
            setIsAuthReady(true);
            return;
          }
          
          const userData = userDoc.data() as UserProfile;
          if (userData.role !== 'customer') {
            await signOut(auth);
            showToast("You are not authorised to login");
            setIsLoggedIn(false);
            setIsAuthReady(true);
            return;
          }

          setIsLoggedIn(true);
          setProfile(userData);
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setIsLoggedIn(false);
        }
      } else if (!user) {
        setIsLoggedIn(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, [isSigningUp, isAuthLoading, isGoogleLoading]);

  // Real-time listeners
  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;

    const uid = auth.currentUser.uid;

    // Listen for bookings
    const qBookings = profile.role === 'admin' 
      ? collection(db, 'bookings')
      : profile.role === 'technician'
        ? query(collection(db, 'bookings'), where('status', '==', 'InProcess'))
        : query(collection(db, 'bookings'), where('uid', '==', uid));
      
    const unsubBookings = onSnapshot(qBookings, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      
      // Sort by createdAt descending to show newest first
      data.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
        return dateB - dateA;
      });

      setBookings(data);
      
      // Set the most recent active booking as the current active one for customers
      if (profile.role === 'customer') {
        const active = data.find(b => b.status === 'InProcess') || data.find(b => b.status === 'open');
        setBooking(active || null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    // Listen for technicians (for admin)
    let unsubTechs = () => {};
    if (profile.role === 'admin') {
      const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
      unsubTechs = onSnapshot(qTechs, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as UserProfile);
        setTechnicians(data);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    }

    return () => {
      unsubBookings();
      unsubTechs();
    };
  }, [isLoggedIn, profile.role]);

  // Notification for missing profile info
  useEffect(() => {
    if (isLoggedIn && isAuthReady && (!profile.address || !profile.roModel)) {
      const timer = setTimeout(() => {
        showToast("Please update your 'Address' and 'RO model' in the Profile section");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn, isAuthReady, profile.address, profile.roModel]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingRoModel, setIsEditingRoModel] = useState(false);
  const [isUpdatingBooking, setIsUpdatingBooking] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<WorkHistory | null>(null);
  const [toast, setToast] = useState({ message: '', visible: false });

  const [historyFilterDate, setHistoryFilterDate] = useState('');

  const combinedWorkHistory = useMemo(() => {
    const closedBookings = bookings.filter(b => b.status?.toLowerCase() === 'closed').map(b => {
      const billing = b.billing || {};
      const sparesArray = (billing as any).spareParts || (billing as any).spares || (billing as any)['Spare parts'] || [];
      const serviceFee = billing.serviceFee ?? 0;
      const sparesTotal = sparesArray.reduce((acc: number, s: any) => acc + (s.price || 0), 0);
      const discount = billing.discount || 0;
      const totalCost = billing.totalAmount ?? 0;

      const rawWarranty = billing.warranty;
      let warrantyStr = 'None';
      
      if (rawWarranty) {
        if (typeof rawWarranty === 'string') {
          // If it's just a string like "1 Year", we keep it, but if it's meant to be a range, we'd need more info.
          // However, the user wants the format "Warranty: DD-MM-YYYY to DD-MM-YYYY".
          warrantyStr = rawWarranty;
        } else if (typeof rawWarranty === 'object') {
          const from = (rawWarranty as any).from || (rawWarranty as any).fromDate || (rawWarranty as any).start;
          const to = (rawWarranty as any).to || (rawWarranty as any).toDate || (rawWarranty as any).end;
          
          if (from && to) {
            warrantyStr = `Warranty: ${formatBookingDateOnly(from)} to ${formatBookingDateOnly(to)}`;
          } else {
            warrantyStr = 'None';
          }
        }
      }

      return {
        id: b.id,
        bookingId: b.bookingId,
        date: formatBookingDateOnly(b.closedDate || b.closedAt || b.bookedDate), // Fetch "Closed" date from closedDate field
        bookedDate: formatBookingDateOnly(b.bookedDate),
        title: b.serviceType,
        description: `Service completed by ${b.technician?.name || 'Technician'}`,
        cost: totalCost,
        status: 'Closed' as const,
        spares: sparesArray.map((s: any) => ({
          partName: s.partName || s.name || 'Unknown Part',
          price: s.price || 0
        })),
        serviceType: b.serviceType,
        technicianName: b.technician?.name || 'Technician',
        uid: b.uid,
        serviceFee: serviceFee,
        discount: discount,
        warranty: warrantyStr
      };
    });
    
    return closedBookings.sort((a, b) => {
      // Sort by ID in Ascending Order
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [bookings]);

  const filteredWorkHistory = useMemo(() => {
    if (!historyFilterDate) return combinedWorkHistory;
    // historyFilterDate is YYYY-MM-DD from input[type=date]
    const [year, month, day] = historyFilterDate.split('-');
    const formattedFilterDate = `${day}-${month}-${year}`;
    
    // Filter based on the "Closed" date (item.date)
    return combinedWorkHistory.filter(item => {
      // Ensure we are comparing the exact formatted date string
      return item.date === formattedFilterDate;
    });
  }, [combinedWorkHistory, historyFilterDate]);

  // Auth states
  const [loginEmail, setLoginEmail] = useState(localStorage.getItem('lastEmail') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');

  // Accordion states
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [openHistoryItems, setOpenHistoryItems] = useState<string[]>([]);

  // Form states
  const [serviceType, setServiceType] = useState<ServiceType | ''>('');
  const [serviceDate, setServiceDate] = useState('');
  const [editProfileData, setEditProfileData] = useState(profile);
  const [editRoModel, setEditRoModel] = useState(profile.roModel);

  const [isDownloading, setIsDownloading] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const hasShownWelcome = useRef(false);

  useEffect(() => {
    if (isLoggedIn && profile.name && justLoggedIn && !hasShownWelcome.current) {
      showToast(`Login successful! Welcome back, ${profile.name}.`);
      hasShownWelcome.current = true;
      setJustLoggedIn(false);
    }
    if (!isLoggedIn) {
      hasShownWelcome.current = false;
      setJustLoggedIn(false);
    }
  }, [isLoggedIn, profile.name, justLoggedIn]);

  const downloadInvoicePDF = async () => {
    if (!selectedInvoice) return;
    setIsDownloading(true);
    try {
      const element = document.getElementById('invoice');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('invoice');
          if (clonedElement) {
            // Force inline styles to override any oklab/oklch from stylesheets
            const allElements = clonedElement.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              try {
                const style = window.getComputedStyle(el);
                // If computed style contains oklch or oklab, replace with a safe fallback
                if (style.color.includes('okl') || style.backgroundColor.includes('okl') || style.borderColor.includes('okl')) {
                  el.style.color = style.color.replace(/okl(ch|ab)\([^)]+\)/g, '#000000');
                  el.style.backgroundColor = style.backgroundColor.replace(/okl(ch|ab)\([^)]+\)/g, '#ffffff');
                  el.style.borderColor = style.borderColor.replace(/okl(ch|ab)\([^)]+\)/g, '#e2e8f0');
                }
              } catch (e) {
                // Ignore errors for elements that might not have computed styles
              }
            }
          }
          
          // Replace all oklch/oklab occurrences in all style tags to prevent parsing errors
          const styles = clonedDoc.getElementsByTagName('style');
          for (let i = 0; i < styles.length; i++) {
            try {
              if (styles[i].innerHTML.includes('oklch') || styles[i].innerHTML.includes('oklab')) {
                styles[i].innerHTML = styles[i].innerHTML.replace(/okl(ch|ab)\([^)]+\)/g, '#777777');
              }
            } catch (e) {
              // Ignore errors
            }
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice_${selectedInvoice.bookingId}.pdf`);
      showToast('Invoice downloaded successfully');
    } catch (error) {
      console.error('PDF generation error:', error);
      showToast('Failed to download PDF. Opening print dialog instead.');
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const showToast = (message: string) => setToast({ message, visible: true });

  const handleAssignTechnician = async (bookingId: string, technician: { name: string; phone: string }) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        technician,
        status: 'InProcess'
      });
      
      showToast(`Technician ${technician.name} assigned`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleConfirmPayment = async (b: Booking, paymentMethod: 'Cash' | 'Online') => {
    try {
      await updateDoc(doc(db, 'bookings', b.id), {
        'billing.paymentMethod': paymentMethod,
        paymentConfirmed: true,
        paymentConfirmedAt: serverTimestamp()
      });
      
      showToast('Payment confirmed successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${b.id}`);
    }
  };

  const handleCloseJob = async (b: Booking) => {
    try {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      await updateDoc(doc(db, 'bookings', b.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedDate: formattedDate
      });
      
      showToast('Job closed successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${b.id}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    const emailLower = loginEmail.trim().toLowerCase();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailLower, loginPassword);
      const user = userCredential.user;
      
      // Validation check
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        showToast("User account does not exist. Please contact support.");
        setIsAuthLoading(false);
        return;
      }
      
      const userData = userDoc.data() as UserProfile;
      if (userData.role !== 'customer') {
        await signOut(auth);
        showToast("You are not authorised to login");
        setIsAuthLoading(false);
        return;
      }

      setJustLoggedIn(true);
      localStorage.setItem('lastEmail', emailLower);
    } catch (error: any) {
      console.error(error);
      if (
        error.code === 'auth/invalid-credential' || 
        error.code === 'auth/user-not-found' || 
        error.code === 'auth/wrong-password'
      ) {
        showToast('Invalid Email or Password');
      } else if (error.code === 'auth/invalid-email') {
        showToast('Please enter a valid email address');
      } else {
        showToast(error.message || 'Login failed');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const user = userCredential.user;
      const additionalInfo = getAdditionalUserInfo(userCredential);
      
      // Check if user profile exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        // Create user profile in Firestore for new or returning users without a profile
        const userProfile: UserProfile = {
          name: user.displayName || 'Google User',
          email: user.email || '',
          phone: '',
          address: '',
          roModel: '',
          role: 'customer',
          createdAt: Timestamp.now()
        };
        
        try {
          await setDoc(doc(db, 'users', user.uid), userProfile);
          setJustLoggedIn(true);
        } catch (fsError) {
          handleFirestoreError(fsError, OperationType.CREATE, `users/${user.uid}`);
        }
      } else {
        // Existing user - check role
        const userData = userDoc.data() as UserProfile;
        if (userData.role !== 'customer') {
          await signOut(auth);
          showToast("You are not authorised to login");
          setIsGoogleLoading(false);
          return;
        }
        setJustLoggedIn(true);
      }
      
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/popup-closed-by-user') {
        showToast('Login cancelled');
      } else {
        showToast(error.message || 'Google Login failed');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Phone number validation: exactly 10 digits
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(regPhone)) {
      showToast('Phone number must be exactly 10 digits');
      return;
    }

    // Password validation: minimum 6 characters
    if (regPassword.length < 6) {
      showToast('Password must be at least 6 characters long');
      return;
    }

    // Phone validation: must be 10 digits if provided
    if (regPhone && regPhone.length !== 10) {
      showToast('Please enter a valid 10-digit phone number');
      return;
    }

    setIsSigningUp(true);
    setIsAuthLoading(true);
    const emailLower = regEmail.trim().toLowerCase();

    try {
      // We rely on Firebase Auth's built-in check for duplicate emails.
      // A pre-signup Firestore query would fail for unauthenticated users due to security rules.
      
      const userCredential = await createUserWithEmailAndPassword(auth, emailLower, regPassword);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: regName });
        
        // Create user profile in Firestore
        const userProfile: UserProfile = {
          name: regName,
          email: emailLower,
          phone: regPhone,
          address: '',
          roModel: '',
          role: 'customer',
          createdAt: Timestamp.now()
        };
        
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), userProfile);
        } catch (fsError) {
          // If Firestore write fails, we should still inform the user but the Auth account is already created.
          // This is a "limbo" state that our login logic handles.
          handleFirestoreError(fsError, OperationType.CREATE, `users/${userCredential.user.uid}`);
        }
      }
      
      // Sign out immediately to prevent auto-login
      await signOut(auth);
      
      showToast(`Signup successful, ${regName}! Please login.`);
      
      // Switch to login mode and pre-fill email
      setAuthMode('login');
      setLoginEmail(emailLower);
      
      // Clear signup form
      setRegName('');
      setRegPhone('');
      setRegEmail('');
      setRegPassword('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/invalid-email') {
        showToast('Please enter a valid email address');
      } else if (error.code === 'auth/email-already-in-use') {
        // Try to repair limbo state (Auth exists but Firestore doc missing)
        try {
          const repairCredential = await signInWithEmailAndPassword(auth, emailLower, regPassword);
          const repairUser = repairCredential.user;
          const userDoc = await getDoc(doc(db, 'users', repairUser.uid));
          
          if (!userDoc.exists()) {
            // Profile is missing, create it
            const userProfile: UserProfile = {
              name: regName,
              email: emailLower,
              phone: regPhone,
              address: '',
              roModel: '',
              role: 'customer',
              createdAt: Timestamp.now()
            };
            await setDoc(doc(db, 'users', repairUser.uid), userProfile);
            
            await signOut(auth);
            showToast(`Account profile restored! Please login.`);
            setAuthMode('login');
            setLoginEmail(emailLower);
            return;
          } else {
            // Document actually exists (maybe query failed earlier or race condition)
            await signOut(auth);
            showToast('This email is already registered. Please login.');
            setAuthMode('login');
            setLoginEmail(emailLower);
            return;
          }
        } catch (repairError: any) {
          if (repairError.code === 'auth/wrong-password') {
            showToast('This email is already in use with a different password. Please login or reset your password.');
          } else {
            showToast('This email is already registered. Please login.');
          }
          setAuthMode('login');
          setLoginEmail(emailLower);
          return;
        }
      } else if (error.code === 'auth/weak-password') {
        showToast('Password is too weak');
      } else {
        showToast(error.message || 'Signup failed');
      }
    } finally {
      setIsSigningUp(false);
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      setIsLoggedIn(false);
      setShowLogoutModal(false);
      showToast('Logout successful');
    } catch (error: any) {
      console.error(error);
      showToast('Logout failed');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, forgotEmail);
      showToast('Password reset link sent to ' + forgotEmail);
      setShowForgotModal(false);
      setForgotEmail('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/invalid-email') {
        showToast('Please enter a valid email address');
      } else if (error.code === 'auth/user-not-found') {
        showToast('No user found with this email');
      } else {
        showToast(error.message || 'Failed to send reset email');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const toggleHistoryItem = (id: string) => {
    setOpenHistoryItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const saveProfile = async () => {
    const trimmedName = editProfileData.name.trim();
    const trimmedPhone = editProfileData.phone.trim();
    const trimmedAddress = editProfileData.address.trim();

    // Name validation
    if (!trimmedName) {
      showToast('Name cannot be empty');
      return;
    }

    // Phone number validation: exactly 10 digits
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      showToast('Phone number must be exactly 10 digits');
      return;
    }

    try {
      setIsSavingProfile(true);
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          name: trimmedName,
          phone: trimmedPhone,
          address: trimmedAddress
        }, { merge: true });
        setProfile({
          ...editProfileData,
          name: trimmedName,
          phone: trimmedPhone,
          address: trimmedAddress
        });
        setIsEditingProfile(false);
        showToast('Profile updated');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveRoModel = async () => {
    const trimmedRoModel = editRoModel.trim();
    setIsSavingRoModel(true);
    try {
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          roModel: trimmedRoModel
        }, { merge: true });
        setProfile(prev => ({ ...prev, roModel: trimmedRoModel }));
        setIsEditingRoModel(false);
        showToast('RO Model updated');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    } finally {
      setIsSavingRoModel(false);
    }
  };

  const handleBooking = async () => {
    if (!serviceType || !serviceDate) {
      showToast('Please fill all fields');
      return;
    }
    
    try {
      setIsBookingLoading(true);
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        
        const nextId = await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, 'counters', 'bookings');
          const counterSnap = await transaction.get(counterRef);
          
          let nextId = 1;
          if (counterSnap.exists()) {
            nextId = counterSnap.data().count + 1;
          }
          
          const bookingId = `RHY${String(nextId).padStart(4, '0')}`;
          const bookingRef = doc(db, 'bookings', bookingId);
          
          const newBookingData = {
            uid,
            bookingId,
            bookedDate: Timestamp.fromDate(new Date(serviceDate)),
            createdAt: serverTimestamp(),
            customerAddress: profile.address,
            customerName: profile.name,
            customerNumber: profile.phone,
            isComplaint: isComplaint,
            roModel: profile.roModel,
            serviceType: serviceType as ServiceType,
            status: 'open' as const,
            technician: {
              name: "",
              phone: ""
            }
          };
          
          transaction.set(bookingRef, newBookingData);
          transaction.set(counterRef, { count: nextId }, { merge: true });
          return nextId;
        });

        setServiceType('');
        setServiceDate('');
        setIsComplaint(false);
        setShowSuccessModal(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    } finally {
      setIsBookingLoading(false);
    }
  };

  const confirmUpdateBooking = async () => {
    if (booking && auth.currentUser) {
      setIsBookingLoading(true);
      try {
        await updateDoc(doc(db, 'bookings', booking.id), {
          serviceType: serviceType as ServiceType,
          bookedDate: Timestamp.fromDate(new Date(serviceDate)),
        });
        setIsUpdatingBooking(false);
        showToast('Booking updated');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
      } finally {
        setIsBookingLoading(false);
      }
    }
  };

  const cancelBooking = async () => {
    if (booking && auth.currentUser) {
      setIsCancelling(true);
      try {
        await updateDoc(doc(db, 'bookings', booking.id), {
          status: 'cancelled'
        });
        
        setShowCancelModal(false);
        setServiceType('');
        setServiceDate('');
        showToast('Booking cancelled');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
      } finally {
        setIsCancelling(false);
      }
    }
  };

  const minDateTime = useMemo(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Droplets className="text-white w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">RHYTHM RO</h1>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex bg-slate-100 p-1.5 rounded-full mb-8">
              <button 
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer active:scale-95 ${authMode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                Login
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer active:scale-95 ${authMode === 'signup' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Full Name" 
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="tel" 
                      placeholder="Phone Number" 
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      placeholder="Password (min 6 chars)" 
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                </>
              )}
              {authMode === 'login' && (
                <>
                  <div className="relative">
                    <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      placeholder="Password" 
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                  <div className="text-right">
                    <button 
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer active:scale-95"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </>
              )}

              <button 
                type="submit"
                disabled={isAuthLoading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98] mt-4 cursor-pointer flex items-center justify-center gap-2"
              >
                {isAuthLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{authMode === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                  </>
                ) : (
                  authMode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>

              <div className="relative flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-slate-100"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or continue with</span>
                <div className="flex-1 h-px bg-slate-100"></div>
              </div>

              <button 
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isAuthLoading}
                className="w-full py-4 bg-white border-2 border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 text-slate-600 rounded-2xl font-bold transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3"
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                <span>{isGoogleLoading ? 'Connecting...' : 'Google'}</span>
              </button>
            </form>
          </div>
        </motion.div>

        <Modal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} title="Forgot Password">
          <form onSubmit={handleForgotSubmit} className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-slate-500 text-sm">Enter your email address and we'll send you a link to reset your password.</p>
            </div>
            <div className="relative">
              <Power className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="email" 
                placeholder="Email Address" 
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-4 bg-blue-600 disabled:bg-blue-400 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 cursor-pointer flex items-center justify-center gap-2"
            >
              {isAuthLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>
        </Modal>

        <Toast message={toast.message} visible={toast.visible} onHide={() => setToast(prev => ({ ...prev, visible: false }))} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Droplets className="text-blue-600 w-6 h-6" />
          <span className="font-black text-slate-800 tracking-tight">RHYTHM RO</span>
        </div>
        <div className="flex items-center gap-3 relative">
          <button 
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-blue-50 transition-colors group cursor-pointer active:scale-95"
          >
            <Bell className="w-5 h-5 text-slate-600 group-hover:text-blue-500" />
          </button>
          <button 
            onClick={() => setShowLogoutModal(true)}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-red-50 transition-colors group cursor-pointer active:scale-95"
          >
            <Power className="w-5 h-5 text-slate-600 group-hover:text-red-500" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-8 space-y-6">
        {profile.role === 'admin' ? (
          <AdminPanel 
            bookings={bookings} 
            technicians={technicians}
            onAssign={handleAssignTechnician}
            onCancel={(id) => {
              const b = bookings.find(x => x.id === id);
              if (b) {
                setBooking(b);
                setShowCancelModal(true);
              }
            }} 
          />
        ) : profile.role === 'technician' ? (
          <TechnicianPanel 
            bookings={bookings}
            onCloseJob={handleCloseJob}
            onConfirmPayment={handleConfirmPayment}
          />
        ) : (
          <>
            {/* Profile Heading */}
            <div className="mb-4 px-2">
              <h3 className="text-lg font-bold text-slate-800">Profile</h3>
            </div>
            {/* Profile Card */}
            <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                    <BadgeCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">{profile.name}</h2>
                  <button onClick={() => {
                    setEditProfileData(profile);
                    setIsEditingProfile(!isEditingProfile);
                  }} className="cursor-pointer active:scale-90">
                    <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-500 transition-colors" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Phone className="w-3 h-3" />
                  <span>{profile.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-xs relative">
                  <div className="relative">
                    <MapPin className={`w-3 h-3 ${!profile.address ? 'text-red-500' : ''}`} />
                    {!profile.address && (
                      <motion.span 
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-red-400 rounded-full -z-10"
                      />
                    )}
                  </div>
                  <span className={!profile.address ? 'text-red-500 font-medium animate-pulse' : ''}>
                    {profile.address || 'Address not filled'}
                  </span>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {isEditingProfile && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden pt-4 border-t border-slate-50 mt-4 space-y-3"
                >
                  <input 
                    type="text" 
                    value={editProfileData.name}
                    onChange={e => setEditProfileData({...editProfileData, name: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="Name"
                  />
                  <input 
                    type="tel" 
                    value={editProfileData.phone}
                    readOnly={!!profile.phone}
                    onChange={e => {
                      if (!profile.phone) {
                        setEditProfileData({...editProfileData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)});
                      }
                    }}
                    className={`w-full px-4 py-2.5 border-none rounded-xl text-sm transition-all ${
                      profile.phone 
                        ? "bg-slate-100 opacity-60 cursor-not-allowed" 
                        : "bg-slate-50 focus:ring-2 focus:ring-blue-500"
                    }`}
                    placeholder="Phone"
                  />
                  <textarea 
                    value={editProfileData.address}
                    onChange={e => setEditProfileData({...editProfileData, address: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="Address"
                    rows={2}
                  />
                  <div className="flex gap-2 pt-2">
                    <button 
                      disabled={isSavingProfile}
                      onClick={() => setIsEditingProfile(false)} 
                      className="flex-1 py-2 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl cursor-pointer disabled:opacity-50 active:scale-95"
                    >
                      Cancel
                    </button>
                    <button 
                      disabled={isSavingProfile}
                      onClick={saveProfile} 
                      className="flex-1 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl cursor-pointer disabled:bg-blue-400 flex items-center justify-center gap-2 active:scale-95"
                    >
                      {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <Droplets className={`w-4 h-4 ${!profile.roModel ? 'text-red-500' : 'text-blue-500'}`} />
                  </div>
                  {!profile.roModel && (
                    <motion.span 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-red-400 rounded-full -z-10"
                    />
                  )}
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-blue-400 block mb-0.5">Device Model</span>
                  <span className={`text-sm font-bold ${!profile.roModel ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
                    {profile.roModel || 'Model not filled'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setEditRoModel(profile.roModel);
                  setIsEditingRoModel(!isEditingRoModel);
                }}
                className="p-2 bg-white rounded-full shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-90"
              >
                <Pencil className="w-3.5 h-3.5 text-blue-500" />
              </button>
            </div>

            <AnimatePresence>
              {isEditingRoModel && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden pt-3 space-y-3"
                >
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={editRoModel}
                      disabled={isSavingRoModel}
                      onChange={e => setEditRoModel(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="RO Model Name"
                    />
                    <button 
                      disabled={isSavingRoModel}
                      onClick={saveRoModel} 
                      className="px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm cursor-pointer disabled:bg-blue-400 flex items-center justify-center min-w-[70px] active:scale-95"
                    >
                      {isSavingRoModel ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Booking Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-bold text-slate-800">Service Request</h3>
            {!booking && (
              <span className="text-[11px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">New</span>
            )}
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100">
            {(!booking || booking.status === 'closed' || booking.status === 'cancelled' || isUpdatingBooking) ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 ml-1">Service Type</label>
                  <select 
                    value={serviceType}
                    onChange={e => setServiceType(e.target.value as ServiceType)}
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Select service</option>
                    <option value="Service Request">Service Request</option>
                    <option value="Installation">Installation</option>
                    <option value="Reinstallation">Reinstallation</option>
                  </select>
                </div>

                {serviceType && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 leading-relaxed font-medium">
                      Estimated service charge: <span className="font-bold">₹{SERVICE_CHARGES[serviceType as ServiceType]}</span>. Spare parts will be charged extra.
                    </p>
                  </motion.div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 ml-1">Preferred Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={serviceDate}
                    min={minDateTime}
                    onChange={e => setServiceDate(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  {isUpdatingBooking && (
                    <button 
                      disabled={isBookingLoading}
                      onClick={() => setIsUpdatingBooking(false)}
                      className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    disabled={isBookingLoading}
                    onClick={isUpdatingBooking ? confirmUpdateBooking : handleBooking}
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98] cursor-pointer disabled:bg-blue-400 flex items-center justify-center gap-2"
                  >
                    {isBookingLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>{isUpdatingBooking ? 'Updating...' : 'Booking...'}</span>
                      </>
                    ) : (
                      isUpdatingBooking ? 'Update Booking' : 'Book Now'
                    )}
                  </button>
                </div>
              </div>
            ) : (() => {
              const isInProcess = booking.status === 'InProcess' || (booking.technician?.name && booking.technician?.phone);
              return (
                <div className="space-y-5">
                  <div className="flex justify-between items-center">
                    <div className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border ${
                      isInProcess ? 'bg-[#FFF9E6] text-[#F39C12] border-[#FDEBD0]' : 'bg-[#E6F9F4] text-[#00B894] border-[#D1F2EB]'
                    }`}>
                      {isInProcess ? 'IN PROCESS' : 'OPEN'}
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">ID: {booking.bookingId}</span>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 mb-1">{booking.serviceType}</h4>
                    <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>{formatBookingDate(booking.bookedDate)}</span>
                    </div>
                  </div>

                  {/* Technician Card - Styled to match images */}
                  <div className="p-3 sm:p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-100/50 flex items-center gap-3">
                    {isInProcess ? (
                      <>
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-emerald-100 shrink-0">
                          <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                            <User className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">Assigned Technician</p>
                          <h5 className="text-sm font-bold text-blue-600 truncate mt-0.5">
                            {booking.technician?.name || 'Technician'}
                          </h5>
                          {booking.technician?.phone && (
                            <div className="flex items-center gap-1 mt-0.5 text-black">
                              <Phone className="w-2.5 h-2.5" />
                              <span className="text-[12px] font-bold tracking-tight">{booking.technician.phone}</span>
                            </div>
                          )}
                        </div>
                        {booking.technician?.phone && (
                          <a 
                            href={`tel:${booking.technician.phone}`}
                            className="w-10 h-10 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-sm border border-blue-100 active:scale-90 transition-transform cursor-pointer"
                          >
                            <PhoneCall className="w-4 h-4" />
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                          <div className="w-3 h-3 bg-slate-200 rounded-full animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">Assigning Technician...</p>
                          <p className="text-xs font-medium text-slate-400 mt-0.5">Waiting for assignment</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button 
                      onClick={() => {
                        if (booking.status === 'InProcess') {
                          showToast("Cannot be cancelled after assigning.");
                        } else {
                          setShowCancelModal(true);
                        }
                      }}
                      className={`flex-1 py-3 sm:py-4 text-sm font-bold border-2 rounded-2xl transition-all cursor-pointer active:scale-95 ${
                        booking.status === 'InProcess' ? 'text-slate-300 border-slate-100 bg-slate-50' : 'text-red-500 border-red-100 hover:bg-red-50'
                      }`}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        setServiceType(booking.serviceType);
                        setServiceDate(typeof booking.bookedDate === 'string' ? booking.bookedDate : booking.bookedDate.toDate().toISOString().slice(0, 16));
                        setIsUpdatingBooking(true);
                      }}
                      className="flex-1 py-3 sm:py-4 text-sm font-bold text-blue-600 border-2 border-blue-100 rounded-2xl hover:bg-blue-50 transition-all cursor-pointer active:scale-95"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        {/* History Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="flex items-center gap-2 group active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800">Work History</h3>
                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                  {filteredWorkHistory.length}
                </span>
                <History className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              {isHistoryOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center gap-2 px-2.5 py-1.5 bg-white border border-black rounded-lg ring-1 ring-slate-200/50">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="date" 
                  value={historyFilterDate}
                  onChange={(e) => setHistoryFilterDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                />
                <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1 min-w-[80px]">
                  {historyFilterDate ? (
                    (() => {
                      const [y, m, d] = historyFilterDate.split('-');
                      return `${d}-${m}-${y}`;
                    })()
                  ) : (
                    <span className="text-slate-400">dd-mm-yyyy</span>
                  )}
                </div>
              </div>
              {historyFilterDate && (
                <button onClick={() => setHistoryFilterDate('')} className="p-1 hover:bg-slate-100 rounded-full">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {isHistoryOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                {filteredWorkHistory.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden">
                      <div 
                        onClick={() => toggleHistoryItem(item.id)}
                        className="w-full p-5 flex justify-between items-start text-left cursor-pointer active:scale-[0.98] transition-transform"
                      >
                        <div>
                          <h4 className="text-sm font-bold text-slate-700">{item.title}</h4>
                          <div className="mt-1 space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">ID: {item.bookingId}</span>
                            <span className="text-[10px] font-semibold text-slate-400 tracking-tight block">Closed: {item.date}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); // prevents parent click
                              setSelectedInvoice(item);
                              setShowInvoiceModal(true);
                            }}
                            className="p-2 hover:bg-blue-50 rounded-full transition-colors group/invoice cursor-pointer active:scale-90"
                            title="View Invoice"
                          >
                            <FileText className="w-4 h-4 text-slate-400 group-hover/invoice:text-blue-500" />
                          </button>
                          <div className="text-right">
                            <span className="text-sm font-black text-blue-600">₹{item.cost}</span>
                            <span className="block text-[11px] font-bold text-emerald-500 tracking-tighter">{item.status}</span>
                          </div>
                          {openHistoryItems.includes(item.id) ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {openHistoryItems.includes(item.id) && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-5 pb-5 overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-slate-50 space-y-4">
                              <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Booked Date</span>
                                <span className="text-xs font-bold text-slate-700">{item.bookedDate}</span>
                              </div>

                              <div className="bg-slate-50/50 rounded-2xl p-4 space-y-4">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  <div className="flex flex-col items-center gap-1">
                                    <span>Fee</span>
                                    <span className="text-slate-700 text-xs font-black">₹{item.serviceFee || 0}</span>
                                  </div>
                                  <div className="w-px h-6 bg-slate-200"></div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span>Discount</span>
                                    <span className="text-emerald-500 text-xs font-black">₹{item.discount || 0}</span>
                                  </div>
                                  <div className="w-px h-6 bg-slate-200"></div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span>Total</span>
                                    <span className="text-blue-600 text-xs font-black">₹{item.cost}</span>
                                  </div>
                                </div>
                                
                                <div className="space-y-2 pt-3 border-t border-slate-100">
                                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Spare Parts</span>
                                  {item.spares && item.spares.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {item.spares.map((spare: SparePart, idx: number) => (
                                        <div key={`${item.id}-spare-${idx}`} className="flex justify-between text-xs">
                                          <span className="text-slate-500">{spare.partName}</span>
                                          <span className="font-bold text-slate-700">₹{spare.price}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">No spare parts added</p>
                                  )}
                                </div>
                              </div>

                              {item.serviceType === 'Installation' && (
                                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <BadgeCheck className="w-4 h-4 text-blue-500" />
                                    <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">Warranty Details</span>
                                  </div>
                                  <p className="text-xs text-blue-700 font-medium leading-relaxed">
                                    {item.warranty || 'None'}
                                  </p>
                                </div>
                              )}
                              
                              <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                                <span className="text-[10px] font-bold text-slate-400">Tech: {item.technicianName}</span>
                                <span className="text-[10px] font-bold text-slate-300">ID: {item.id}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
          </>
        )}
      </main>

      {/* Floating Contact Bar */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-2 left-4 right-4 z-40"
      >
        <a 
          href="tel:+918610436687"
          className="flex items-center justify-center gap-4 bg-slate-900 text-white py-2 px-6 rounded-full shadow-2xl shadow-slate-400/50 group cursor-pointer"
        >
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <PhoneCall className="w-4 h-4 text-white" />
          </div>
          <div className="text-center">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-widest leading-tight">Emergency Support</span>
            <span className="text-xs font-bold">+91 8610436687</span>
          </div>
          <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center shrink-0">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </a>
      </motion.div>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Confirm Logout">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Power className="w-10 h-10 text-red-500" />
          </div>
          <p className="text-slate-500">Are you sure you want to log out of your account?</p>
          <div className="flex gap-3">
            <button 
              disabled={isLoggingOut}
              onClick={() => setShowLogoutModal(false)} 
              className="flex-1 py-3.5 bg-slate-100 text-slate-500 font-bold rounded-2xl cursor-pointer disabled:opacity-50 active:scale-95"
            >
              Stay
            </button>
            <button 
              disabled={isLoggingOut}
              onClick={handleLogout} 
              className="flex-1 py-3.5 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-100 cursor-pointer disabled:bg-red-400 flex items-center justify-center gap-2 active:scale-95"
            >
              {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Logout'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Invoice Details" maxWidth="max-w-2xl">
        {selectedInvoice && (
          <div 
            id="invoice" 
            className="space-y-6 print-invoice bg-white text-black p-2 sm:p-4"
            style={{
              color: "#000000",
              backgroundColor: "#ffffff"
            }}
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-6">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                    <Droplets className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 tracking-tight leading-none">RHYTHM RO</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Service Invoice</p>
                    <p className="text-[10px] text-blue-600 font-bold mt-1">+91 8610436687</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-tight mt-1 max-w-[250px]">
                      1st Floor, Mohanan Complex, No: 3/23, Rajiv Gandhi Salai, Kittu Nagar, Kelambakkam, Tamil Nadu 603103
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Booking ID</p>
                  <p className="text-sm font-black text-slate-800">{selectedInvoice.bookingId}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Bill To</p>
                  <p className="text-sm font-bold text-slate-700">{profile.name}</p>
                  <p className="text-xs text-slate-500">{profile.phone}</p>
                  <p className="text-xs text-slate-500 leading-tight mt-1">{profile.address}</p>
                </div>
                <div className="text-right sm:text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Service Details</p>
                  <p className="text-sm font-bold text-slate-700">{selectedInvoice.serviceType}</p>
                  <p className="text-xs text-slate-500">Closed Date: {selectedInvoice.date}</p>
                  <p className="text-xs text-slate-500 mt-1">Tech: {selectedInvoice.technicianName}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Service Fee</span>
                  <span className="font-bold text-slate-700">₹{selectedInvoice.serviceFee || 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-bold text-emerald-500">- ₹{selectedInvoice.discount || 0}</span>
                </div>
                {selectedInvoice.spares && selectedInvoice.spares.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Spare Parts Changed</p>
                    <div className="space-y-1.5">
                      {selectedInvoice.spares.map((spare, idx) => (
                        <div key={`invoice-spare-${idx}`} className="flex justify-between text-[11px]">
                          <span className="text-slate-600">{spare.partName}</span>
                          <span className="text-slate-700 font-bold">₹{spare.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Total Amount</span>
                  <span className="text-lg font-black text-blue-600">₹{selectedInvoice.cost}</span>
                </div>
              </div>

              {selectedInvoice.serviceType === 'Installation' && selectedInvoice.warranty && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <span className="text-[10px] font-bold text-blue-600 block mb-1 uppercase tracking-wider">Warranty Details</span>
                  <p className="text-[11px] text-blue-700 font-medium leading-relaxed">{selectedInvoice.warranty}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <p className="text-[10px] text-blue-600 font-medium leading-relaxed">
                    <span className="font-bold block mb-1 uppercase tracking-wider">Note:</span>
                    This is a system generated invoice. Goods once sold will not be taken back or exchanged.
                  </p>
                </div>
                
                <div className="flex gap-3 no-print">
                  <button 
                    onClick={downloadInvoicePDF}
                    disabled={isDownloading}
                    className="flex-1 py-3.5 bg-slate-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                  </button>
                  <button 
                    onClick={() => setShowInvoiceModal(false)}
                    className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-transform cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  Rhythm RO Service • 1st Floor, Mohanan Complex, No: 3/23, Rajiv Gandhi Salai, Kittu Nagar, Kelambakkam, Tamil Nadu 603103 • +91 8610436687
                </p>
              </div>
            </div>
          )}
        </Modal>

      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Booking">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800">Are you sure?</h4>
            <p className="text-slate-500 text-sm">This will permanently cancel your service request for <span className="font-bold text-slate-700">{booking?.type}</span>.</p>
          </div>
          <div className="flex gap-3">
            <button 
              disabled={isCancelling}
              onClick={() => setShowCancelModal(false)} 
              className="flex-1 py-3.5 bg-slate-100 text-slate-500 font-bold rounded-2xl cursor-pointer disabled:opacity-50 active:scale-95"
            >
              Keep Booking
            </button>
            <button 
              disabled={isCancelling}
              onClick={cancelBooking} 
              className="flex-1 py-3.5 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-100 cursor-pointer disabled:bg-red-400 flex items-center justify-center gap-2 active:scale-95"
            >
              {isCancelling ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Yes, Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Booking Confirmed">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800">Request Received!</h4>
            <p className="text-slate-500 text-sm">Your booking <span className="font-bold text-blue-600">{booking?.id}</span> is confirmed. A technician will be assigned shortly.</p>
          </div>
          <button onClick={() => setShowSuccessModal(false)} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 cursor-pointer active:scale-95">Great!</button>
        </div>
      </Modal>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast(prev => ({ ...prev, visible: false }))} />
    </div>
  );
}
