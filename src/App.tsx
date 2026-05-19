import React, { useState, useEffect, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import { 
  Candle, 
  Trade, 
  TradeType, 
  TradeRecord, 
  MADirection,
  Timeframe
} from './types';
import { CandlestickChart } from './components/CandlestickChart';
import { analyzePerformance } from './services/geminiService';
import { 
  Play, 
  Plus, 
  Minus, 
  Upload, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  History,
  XCircle,
  Database,
  Home
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EyeLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="64" height="64" rx="16" fill="#0A2458"/>
    <path d="M58 32C58 32 48.5 45 32 45C15.5 45 6 32 6 32C6 32 15.5 19 32 19C48.5 19 58 32 58 32Z" fill="white"/>
    <circle cx="32" cy="32" r="9" fill="#E69110"/>
  </svg>
);

export default function App() {
  const [fullData, setFullData] = useState<Candle[]>([]);
  const [rawCSVData, setRawCSVData] = useState<Candle[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.M1);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const VIEWPORT_SIZE = 80;
  const [balance, setBalance] = useState(1000000); // This now represents Liquid Cash
  const [initialBalance, setInitialBalance] = useState(1000000);
  const [baseBalance, setBaseBalance] = useState(1000000);
  const [multiplier, setMultiplier] = useState(1);
  const [marginPerLot, setMarginPerLot] = useState(100000); 
  const [positionSize, setPositionSize] = useState(1);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [maPeriods, setMaPeriods] = useState<number[]>([5, 10, 20, 60, 120, 240]);
  const [averageEntryPrice, setAverageEntryPrice] = useState<number>(0);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showInsufficientBalanceAlert, setShowInsufficientBalanceAlert] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePosition = useMemo(() => {
    return trades.reduce((acc, t) => acc + (t.type === TradeType.BUY ? t.quantity : -t.quantity), 0);
  }, [trades]);

  const totalAssets = useMemo(() => {
    if (currentIndex === -1 || fullData.length === 0) return balance;
    const currentPrice = fullData[currentIndex].Close;
    
    // In Margin Account: Equity = Cash Balance + Unrealized PnL
    // Unrealized PnL = (Current Price - Avg Price) * Position * Multiplier
    const unrealizedPnL = activePosition === 0 ? 0 : (currentPrice - averageEntryPrice) * activePosition * multiplier;
    return balance + unrealizedPnL;
  }, [balance, activePosition, averageEntryPrice, currentIndex, fullData, multiplier]);

  const maxAllowedPosition = useMemo(() => {
    return Math.max(1, Math.floor(totalAssets / marginPerLot) * 2);
  }, [totalAssets, marginPerLot]);

  useEffect(() => {
    if (positionSize > maxAllowedPosition) {
      setPositionSize(maxAllowedPosition);
    }
  }, [maxAllowedPosition, positionSize]);

  const currentPnL = useMemo(() => {
    if (activePosition === 0) return 0;
    return totalAssets - baseBalance;
  }, [activePosition, totalAssets, baseBalance]);

  const currentMATrends = useMemo(() => {
    if (currentIndex === -1 || fullData.length === 0) return [];
    return maPeriods.map(period => {
      const getMA = (idx: number) => {
        const slice = fullData.slice(Math.max(0, idx - period + 1), idx + 1);
        if (slice.length === 0) return 0;
        return slice.reduce((sum, c) => sum + c.Close, 0) / slice.length;
      };
      const currentMA = getMA(currentIndex);
      const prevMA = getMA(currentIndex - 1);
      
      let direction = MADirection.FLAT;
      if (currentMA > prevMA) direction = MADirection.UP;
      else if (currentMA < prevMA) direction = MADirection.DOWN;
      
      return { period, value: currentMA, direction };
    });
  }, [currentIndex, fullData, maPeriods]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const parsed = (results.data as any[])
          .filter((row: any) => row.Date && row.Time && row.Open)
          .map((row: any) => ({
            ...row,
            timestamp: new Date(`${row.Date} ${row.Time}`).getTime()
          }))
          .sort((a: any, b: any) => a.timestamp - b.timestamp);

        setRawCSVData(parsed);
        applyTimeframe(parsed, timeframe);
      }
    });
  };

  const loadSampleData = async () => {
    setIsLoading(true);
    try {
      const files = ['/TXF2021.csv', '/TXF2022.csv', '/TXF2023.csv'];
      const randomFile = files[Math.floor(Math.random() * files.length)];
      console.log(`Loading random dataset: ${randomFile}`);
      
      const response = await fetch(randomFile);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          const parsed = (results.data as any[])
            .filter((row: any) => row.Date && row.Time && row.Open)
            .map((row: any) => ({
              ...row,
              timestamp: new Date(`${row.Date.replace(/\//g, '-')} ${row.Time}`).getTime()
            }))
            .sort((a: any, b: any) => a.timestamp - b.timestamp);

          setRawCSVData(parsed);
          applyTimeframe(parsed, timeframe);
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Error loading sample data:', error);
      setIsLoading(false);
      alert('無法載入範例資料');
    }
  };

  const applyTimeframe = (rawData: Candle[], tf: Timeframe) => {
    let processed: Candle[] = [];
    
    const aggregate = (chunk: Candle[]): Candle => ({
      Date: chunk[chunk.length - 1].Date,
      Time: chunk[chunk.length - 1].Time,
      Open: chunk[0].Open,
      High: Math.max(...chunk.map(c => c.High)),
      Low: Math.min(...chunk.map(c => c.Low)),
      Close: chunk[chunk.length - 1].Close,
      Volume: chunk.reduce((sum, c) => sum + (c.Volume || 0), 0),
      timestamp: chunk[0].timestamp
    });

    if (tf === Timeframe.M1) {
      processed = rawData;
    } else if (tf === Timeframe.M5) {
      for (let i = 0; i < rawData.length; i += 5) {
        const chunk = rawData.slice(i, i + 5);
        if (chunk.length > 0) {
          processed.push(aggregate(chunk));
        }
      }
    } else if (tf === Timeframe.M60) {
      const windows = [
        { s: '08:46:00', e: '09:45:00' }, { s: '09:46:00', e: '10:45:00' }, { s: '10:46:00', e: '11:45:00' },
        { s: '11:46:00', e: '12:45:00' }, { s: '12:46:00', e: '13:45:00' },
        { s: '15:01:00', e: '16:00:00' }, { s: '16:01:00', e: '17:00:00' }, { s: '17:01:00', e: '18:00:00' },
        { s: '18:01:00', e: '19:00:00' }, { s: '19:01:00', e: '20:00:00' }, { s: '20:01:00', e: '21:00:00' },
        { s: '21:01:00', e: '22:00:00' }, { s: '22:01:00', e: '23:00:00' }, { s: '23:01:00', e: '00:00:00', cross: true },
        { s: '00:01:00', e: '01:00:00' }, { s: '01:01:00', e: '02:00:00' }, { s: '02:01:00', e: '03:00:00' },
        { s: '03:01:00', e: '04:00:00' }, { s: '04:01:00', e: '05:00:00' }
      ];

      let currentChunk: Candle[] = [];
      let lastWindowIdx = -1;
      let lastDate = '';

      for (const candle of rawData) {
        const time = candle.Time;
        const date = candle.Date;
        
        let foundIdx = windows.findIndex(w => {
          if (w.cross) return time >= w.s || time === '00:00:00';
          return time >= w.s && time <= w.e;
        });

        const isSameWindow = foundIdx !== -1 && foundIdx === lastWindowIdx && (date === lastDate || (foundIdx === 13 && lastWindowIdx === 13));

        if (foundIdx !== -1) {
          if (isSameWindow) {
            currentChunk.push(candle);
          } else {
            if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
            currentChunk = [candle];
          }
          lastWindowIdx = foundIdx;
          lastDate = date;
        } else {
          if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
          currentChunk = [];
          lastWindowIdx = -1;
          lastDate = '';
        }
      }
      if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
    } else if (tf === Timeframe.D1) {
      let currentChunk: Candle[] = [];
      for (const candle of rawData) {
        const time = candle.Time;
        // 15:01:00 is the start of the "next" trading day session
        if (time === '15:01:00') {
          if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
          currentChunk = [candle];
        } else {
          // Include if in night session (15:01-23:59) or day session (00:00-13:45)
          const inSession = time >= '15:01:00' || time <= '13:45:00';
          if (inSession) {
            currentChunk.push(candle);
          }
          // Close if we hit the end of day session
          if (time === '13:45:00') {
            if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
            currentChunk = [];
          }
        }
      }
      if (currentChunk.length > 0) processed.push(aggregate(currentChunk));
    }

    setFullData(processed);
    if (processed.length > 0) {
      const startPoint = Math.min(processed.length - 1, Math.floor(Math.random() * (processed.length * 0.2)) + Math.floor(processed.length * 0.1));
      // Ensure we have at least some history for MAs
      const safeStart = Math.max(Math.min(processed.length - 1, 240), startPoint);
      setCurrentIndex(safeStart);
      const startIdx = Math.max(0, safeStart - VIEWPORT_SIZE);
      setVisibleStartIndex(startIdx);
      setIsAutoScroll(true);
    }
  };

  useEffect(() => {
    if (rawCSVData.length > 0) {
      applyTimeframe(rawCSVData, timeframe);
    }
  }, [timeframe]);

  const handleNext = () => {
    if (currentIndex < fullData.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      
      if (isAutoScroll) {
        if (nextIndex - visibleStartIndex >= VIEWPORT_SIZE) {
          setVisibleStartIndex(nextIndex - VIEWPORT_SIZE + 1);
        }
      }
    }
  };

  const getMATrends = (index: number): { period: number, direction: MADirection }[] => {
    return maPeriods.map(period => {
      if (index < period) return { period, direction: MADirection.FLAT };
      const getMA = (idx: number) => {
        const slice = fullData.slice(Math.max(0, idx - period + 1), idx + 1);
        if (slice.length === 0) return 0;
        return slice.reduce((sum, c) => sum + c.Close, 0) / slice.length;
      };
      const currentMA = getMA(index);
      const prevMA = getMA(index - 1);
      
      let direction = MADirection.FLAT;
      if (currentMA > prevMA) direction = MADirection.UP;
      else if (currentMA < prevMA) direction = MADirection.DOWN;
      
      return { period, direction };
    });
  };

  const executeTrade = (type: TradeType) => {
    if (currentIndex === -1) return;
    
    const candle = fullData[currentIndex];
    const tradePrice = candle.Close;

    const nextPosition = activePosition + (type === TradeType.BUY ? positionSize : -positionSize);

    // Calculate predicted balance after trade (to include realized profit if any)
    let predictedProfit = 0;
    if (!((activePosition >= 0 && type === TradeType.BUY) || (activePosition <= 0 && type === TradeType.SELL))) {
      const qtyToClose = Math.min(Math.abs(activePosition), positionSize);
      const unitProfit = activePosition > 0 ? (tradePrice - averageEntryPrice) : (averageEntryPrice - tradePrice);
      predictedProfit = unitProfit * qtyToClose * multiplier;
    }

    if (balance + predictedProfit < Math.abs(nextPosition) * marginPerLot) {
      setShowInsufficientBalanceAlert(true);
      return;
    }

    const maTrends = getMATrends(currentIndex);
    
    // Calculate realized profit and update average entry price
    let nextAvgPrice = averageEntryPrice;
    let realizedProfit: number | null = null;
    let currentBalance = balance;
    const newRecords: TradeRecord[] = [];

    // Determine if we are adding to position or reducing/flipping
    const isAdding = (activePosition >= 0 && type === TradeType.BUY) || (activePosition <= 0 && type === TradeType.SELL);
    
    if (isAdding) {
      // Adding to position (or opening new)
      const currentAbsPos = Math.abs(activePosition);
      nextAvgPrice = (currentAbsPos * averageEntryPrice + positionSize * tradePrice) / (currentAbsPos + positionSize);
      
      newRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        date: candle.Date,
        time: candle.Time,
        type: type,
        category: '新倉',
        quantity: positionSize,
        maTrends: maTrends,
        profit: null,
        totalBalance: 0 // Will update below
      });
    } else {
      // Reducing or flipping position
      const qtyToClose = Math.min(Math.abs(activePosition), positionSize);
      
      const unitProfit = activePosition > 0 ? (tradePrice - averageEntryPrice) : (averageEntryPrice - tradePrice);
      realizedProfit = unitProfit * qtyToClose * multiplier;
      
      // Handle floating point precision for $0
      if (Math.abs(realizedProfit) < 0.0001) realizedProfit = 0;

      // Update cash balance with realized profit for calculation
      currentBalance += realizedProfit;

      // Create "平倉" record
      newRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        date: candle.Date,
        time: candle.Time,
        type: type,
        category: '平倉',
        quantity: qtyToClose,
        maTrends: maTrends,
        profit: realizedProfit,
        totalBalance: 0 // Will update below
      });

      // If we flipped the position
      if (positionSize > Math.abs(activePosition)) {
        const remainingQty = positionSize - Math.abs(activePosition);
        nextAvgPrice = tradePrice;
        
        // Create "新倉" record for the flip balance
        newRecords.push({
          id: Math.random().toString(36).substr(2, 9),
          date: candle.Date,
          time: candle.Time,
          type: type,
          category: '新倉',
          quantity: remainingQty,
          maTrends: maTrends,
          profit: null,
          totalBalance: 0 // Will update below
        });
      } else if (positionSize === Math.abs(activePosition)) {
        nextAvgPrice = 0;
      }
      // If we reduced but stayed same direction, nextAvgPrice stays same
    }

    // Apply finalized values
    setBalance(currentBalance);
    setAverageEntryPrice(nextAvgPrice);

    if (activePosition === 0 && nextPosition !== 0) {
      setBaseBalance(currentBalance);
    }

    // Add to trades (for chart markers)
    const newTrade: Trade = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: candle.timestamp,
      date: candle.Date,
      time: candle.Time,
      type,
      price: tradePrice,
      quantity: positionSize,
      maTrends: maTrends
    };
    setTrades(prev => [...prev, newTrade]);

    // Update records with correct equity and push to state
    const processedRecords = newRecords.map((rec, i) => {
      // For flipped records, the equity remains similar at that instant
      // but we can be more precise if needed. 
      // For simplicity, we use the equity at the end of the full action
      const unrealizedAfter = nextPosition === 0 ? 0 : (tradePrice - nextAvgPrice) * nextPosition * multiplier;
      const currentEquityAtTrade = currentBalance + unrealizedAfter;
      return { ...rec, totalBalance: currentEquityAtTrade };
    });

    setRecords(prev => [...processedRecords.reverse(), ...prev]);

    handleNext();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;
      if (fullData.length === 0) return;

      const key = e.key.toLowerCase();
      
      if (key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (key === 'b') {
        e.preventDefault();
        executeTrade(TradeType.BUY);
      } else if (key === 's') {
        e.preventDefault();
        executeTrade(TradeType.SELL);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullData.length, currentIndex, balance, activePosition, positionSize, multiplier]);

  const handleEndGame = async () => {
    setIsAnalyzing(true);
    const analysisResult = await analyzePerformance(records, totalAssets, initialBalance);
    setAnalysis(analysisResult);
    setIsAnalyzing(false);
  };

  const resetToInitial = () => {
    setRawCSVData([]);
    setFullData([]);
    setCurrentIndex(-1);
    setVisibleStartIndex(0);
    setIsAutoScroll(true);
    setTrades([]);
    setRecords([]);
    setAnalysis(null);
    setBalance(initialBalance);
    setBaseBalance(initialBalance);
    setAverageEntryPrice(0);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden">
      {fullData.length === 0 ? (
        // Initial Setup View
        <div className="flex-1 flex flex-col items-center overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 md:p-8">
          <div className="w-full max-w-xl bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-6 md:p-10 rounded-3xl shadow-2xl flex flex-col gap-6 md:gap-8 my-auto">
            <div className="text-center space-y-2">
              <EyeLogo className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-2 md:mb-4 shadow-lg shadow-blue-900/20 rounded-2xl" />
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">投資模擬器</h1>
              <p className="text-slate-400 text-xs md:text-sm italic">請先配置模擬參數 均線可自由增減</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">初始資金 (單位: 萬)</label>
                  <input 
                    type="number" 
                    value={initialBalance / 10000} 
                    onChange={(e) => {
                      const val = (parseFloat(e.target.value) || 0) * 10000;
                      setInitialBalance(val);
                      setBalance(val);
                      setBaseBalance(val);
                    }}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 md:py-3 text-sm focus:outline-none focus:border-amber-500 transition-colors text-white" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">單口保證金 (單位: 萬)</label>
                  <input 
                    type="number" 
                    value={marginPerLot / 10000} 
                    onChange={(e) => setMarginPerLot((parseFloat(e.target.value) || 0) * 10000)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 md:py-3 text-sm focus:outline-none focus:border-amber-500 transition-colors text-white" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">每點盈餘 (Multiplier)</label>
                  <input 
                    type="number" 
                    value={multiplier} 
                    onChange={(e) => setMultiplier(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 md:py-3 text-sm focus:outline-none focus:border-amber-500 transition-colors text-white" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">投資週期 (Timeframe)</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[Timeframe.M1, Timeframe.M5, Timeframe.M60, Timeframe.D1].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={cn(
                          "py-2 md:py-3 rounded-xl text-xs font-bold transition-all border",
                          timeframe === tf 
                            ? "bg-amber-500 border-amber-600 text-black shadow-lg shadow-amber-900/20" 
                            : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        )}
                      >
                        {tf === Timeframe.M1 ? "1分" : tf === Timeframe.M5 ? "5分" : tf === Timeframe.M60 ? "60分" : "1天"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-slate-500 font-bold">均線設定 (MA Periods)</label>
                  {maPeriods.length < 6 && (
                    <button 
                      onClick={() => setMaPeriods([...maPeriods, 5])}
                      className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-600/40 transition-colors"
                    >
                      + 新增長度
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {maPeriods.map((p, i) => (
                    <div key={i} className="relative group">
                      <input 
                        type="number" 
                        value={p}
                        onChange={(e) => {
                          const newPeriods = [...maPeriods];
                          newPeriods[i] = parseInt(e.target.value) || 5;
                          setMaPeriods(newPeriods);
                        }}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-2 py-2 text-[10px] focus:outline-none focus:border-blue-500 text-center text-white" 
                      />
                      <button 
                        onClick={() => setMaPeriods(maPeriods.filter((_, index) => index !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {maPeriods.length === 0 && (
                  <p className="text-slate-600 text-[10px] italic text-center py-2">尚未設定均線</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={loadSampleData}
                disabled={isLoading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-amber-900/40 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 ease-in-out"></div>
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    <span className="text-lg">開始回測</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Simulation View
        <>
          {/* Top Header */}
          <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-4">
              <EyeLogo className="w-8 h-8 rounded shadow-[0_0_15px_rgba(10,36,88,0.5)]" />
              <h1 className="text-lg font-bold tracking-tight">EM AI <span className="font-light text-slate-400">Simulator</span></h1>
            </div>
            
            <div className="flex gap-8 items-center">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">戶口餘額 (Cash)</span>
                <span className="text-sm font-mono text-slate-400 font-bold">${Math.round(balance - Math.abs(activePosition) * marginPerLot).toLocaleString()}</span>
              </div>
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">保證金佔用 (Margin)</span>
                <span className="text-sm font-mono text-blue-400 font-bold">
                  {Math.round(Math.abs(activePosition) * marginPerLot).toLocaleString()} / {Math.round(initialBalance).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">目前部位 (Position)</span>
                <span className={cn(
                  "text-sm font-mono font-bold",
                  activePosition > 0 ? "text-rose-400" : activePosition < 0 ? "text-emerald-400" : "text-slate-400"
                )}>
                  {activePosition > 0 ? `+${activePosition}` : activePosition < 0 ? activePosition : '0'} UNIT{Math.abs(activePosition) !== 1 ? 'S' : ''}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">目前盈虧 (PnL)</span>
                <span className={cn(
                  "text-sm font-mono font-bold",
                  currentPnL > 0 ? "text-rose-500" : (currentPnL < 0 ? "text-emerald-400" : "text-slate-500")
                )}>
                  {currentPnL >= 0 ? '+' : ''}${Math.round(currentPnL).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-end border-l border-slate-800 pl-4 ml-2">
                <span className="text-[10px] uppercase text-amber-500 font-bold tracking-wider">總資產 (Equity)</span>
                <span className={cn(
                  "text-sm font-mono font-bold",
                  totalAssets > initialBalance ? "text-rose-500" : (totalAssets < initialBalance ? "text-emerald-400" : "text-slate-400")
                )}>
                  ${Math.round(totalAssets).toLocaleString()}
                </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto scroll-smooth">
            <main className="flex flex-col min-h-full">
              {/* Upper Section: Chart + Config */}
              <div className="flex h-[75vh] min-h-[500px] shrink-0 border-b border-slate-800">
                {/* Chart Area */}
                <section className="flex-1 flex flex-col relative text-white bg-slate-900/10">
                  <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/30">
                    <div className="flex gap-4 items-center">
                      <span className="text-xs text-slate-400 font-mono">SYMBOL: DATASET/SIM ({timeframe === Timeframe.M1 ? '1M' : timeframe === Timeframe.M5 ? '5M' : timeframe === Timeframe.M60 ? '60M' : '1D'})</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] items-center">
                        {currentMATrends.map((trend, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className={cn(
                              "font-bold",
                              i === 0 ? "text-blue-400" : i === 1 ? "text-purple-400" : i === 2 ? "text-amber-400" : i === 3 ? "text-rose-400" : i === 4 ? "text-emerald-400" : "text-indigo-400"
                            )}>MA({trend.period}): <span className="text-slate-100 font-mono">{Math.round(trend.value).toLocaleString()}</span></span>
                            <span className={cn(
                              "text-[10px] font-bold",
                              trend.direction === MADirection.UP ? "text-rose-500" : 
                              trend.direction === MADirection.DOWN ? "text-emerald-400" : "text-slate-500"
                            )}>
                              {trend.direction === MADirection.UP ? "▲" : trend.direction === MADirection.DOWN ? "▼" : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {currentIndex !== -1 && (
                      <div className="text-xs font-mono text-slate-400">
                        {fullData[currentIndex].Date} <span className="text-slate-600">{fullData[currentIndex].Time}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-opacity-5">
                    <CandlestickChart 
                      allData={fullData}
                      startIndex={visibleStartIndex}
                      endIndex={isAutoScroll ? currentIndex : Math.min(visibleStartIndex + VIEWPORT_SIZE - 1, currentIndex)}
                      trades={trades} 
                      maPeriods={maPeriods} 
                      onScroll={(newStart) => {
                        const maxStart = Math.max(0, currentIndex - VIEWPORT_SIZE + 1);
                        const constrainedStart = Math.max(0, Math.min(newStart, maxStart));
                        setVisibleStartIndex(constrainedStart);
                        // If we scrolled to the very end or beyond, re-enable auto-scroll
                        if (constrainedStart >= maxStart) {
                          setIsAutoScroll(true);
                        } else {
                          setIsAutoScroll(false);
                        }
                      }}
                    />
                    {!isAutoScroll && (
                      <button 
                        onClick={() => {
                          setIsAutoScroll(true);
                          setVisibleStartIndex(Math.max(0, currentIndex - VIEWPORT_SIZE + 1));
                        }}
                        className="absolute bottom-4 right-4 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-amber-900/40 z-20 flex items-center gap-2"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        回到最新 (BACK TO LATEST)
                      </button>
                    )}
                  </div>
                </section>

                {/* Config & Controls (Side Panel) */}
                <aside className="w-[320px] bg-slate-900/60 flex flex-col border-l border-slate-800 shrink-0">
                  <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1">
                    <section className="space-y-4">
                      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-800 pb-2">Simulator Config</h3>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <label className="block text-[11px] text-slate-400">部位數量 (Size)</label>
                          <span className="text-xs font-mono text-amber-500 font-bold">{positionSize}</span>
                        </div>
                        <input 
                          type="range" 
                          min="1"
                          max={maxAllowedPosition}
                          step="1"
                          value={positionSize} 
                          onChange={(e) => setPositionSize(Math.min(maxAllowedPosition, parseInt(e.target.value)))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 transition-all hover:bg-slate-700" 
                        />
                      </div>
                    </section>

                    <section className="flex flex-col gap-4">
                      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-800 pb-2">Trading Actions</h3>
                      
                      <button 
                        onClick={handleNext}
                        disabled={!fullData.length}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 active:scale-[0.98] outline-none shadow-lg shadow-indigo-900/20"
                      >
                        下一步 (NEXT)
                        <Play className="w-4 h-4 fill-current" />
                      </button>

                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => executeTrade(TradeType.BUY)}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-4 rounded-lg shadow-xl shadow-rose-900/20 active:translate-y-0.5 transition-all outline-none"
                        >
                          買進 (BUY)
                        </button>
                        <button 
                          onClick={() => executeTrade(TradeType.SELL)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg shadow-xl shadow-emerald-900/20 active:translate-y-0.5 transition-all outline-none"
                        >
                          賣出 (SELL)
                        </button>
                      </div>
                    </section>

                    <div className="mt-auto pt-6 border-t border-slate-800 space-y-4">
                      <button 
                        onClick={handleEndGame}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 py-3 rounded-md text-xs font-bold tracking-widest transition-all flex items-center justify-center gap-2 outline-none uppercase"
                      >
                        <XCircle className="w-4 h-4" />
                        分析結果 (ANALYSIS)
                      </button>

                      <button 
                        onClick={resetToInitial}
                        className="w-full bg-slate-900 border border-slate-800 text-slate-600 hover:text-slate-400 hover:bg-slate-800 py-3 rounded-md text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-2 outline-none uppercase"
                      >
                        <Home className="w-3.5 h-3.5" />
                        返回首頁 (BACK TO HOME)
                      </button>
                    </div>
                  </div>
                </aside>
              </div>

              {/* Lower Section: Records */}
              <footer className="p-10 bg-slate-950 flex flex-col gap-6 min-h-[400px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <h3 className="text-sm uppercase tracking-widest text-slate-300 font-bold">Investment History</h3>
                  <div className="text-[10px] text-slate-500 font-mono tracking-wider">TOTAL TRADES: {records.length} | ACTIVE POS: {activePosition} UNITS</div>
                </div>
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/10 shadow-2xl">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-500">
                      <tr>
                        <th className="p-4 font-bold uppercase tracking-tighter">時間 (Time)</th>
                        <th className="p-4 font-bold uppercase tracking-tighter">類型 (Type)</th>
                        <th className="p-4 font-bold uppercase tracking-tighter">數量 (Size)</th>
                        <th className="p-4 font-bold uppercase tracking-tighter text-center">趨勢 (Trend)</th>
                        <th className="p-4 font-bold uppercase tracking-tighter text-right">實現盈虧 (Realized)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="p-4 text-slate-400">{r.date} {r.time}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "font-bold px-2 py-1 rounded text-[10px] uppercase",
                                r.type === TradeType.BUY ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              )}>
                                {r.type === TradeType.BUY ? '買' : '賣'}
                              </span>
                              <span className={cn(
                                "font-bold px-2 py-1 rounded text-[10px]",
                                r.category === '新倉' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              )}>
                                {r.category}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-slate-300">{r.quantity} UNITS</td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              {r.maTrends.map((trend, idx) => (
                                <div 
                                  key={idx} 
                                  className={cn(
                                    "flex flex-col items-center",
                                    trend.direction === MADirection.UP ? "text-rose-500" : 
                                    trend.direction === MADirection.DOWN ? "text-emerald-400" : "text-slate-500"
                                  )}
                                  title={`MA(${trend.period})`}
                                >
                                  <span className="text-xs">{trend.direction === MADirection.UP ? "▲" : trend.direction === MADirection.DOWN ? "▼" : "—"}</span>
                                  <span className="text-[8px] font-mono leading-none opacity-60">{trend.period}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className={cn(
                            "p-4 text-right font-bold text-sm",
                            r.profit !== null ? (r.profit > 0 ? "text-rose-500" : r.profit < 0 ? "text-emerald-400" : "text-slate-500") : "text-slate-500"
                          )}>
                            {r.profit !== null ? (r.profit > 0 ? `+$${Math.round(r.profit).toLocaleString()}` : r.profit < 0 ? `-$${Math.round(Math.abs(r.profit)).toLocaleString()}` : `$0`) : '—'}
                          </td>
                        </tr>
                      ))}
                      {records.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-20 text-center text-slate-700 italic tracking-[0.2em] uppercase text-xs">No records found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </footer>
            </main>
          </div>
        </>
      )}

      {/* Analysis Modal */}
      {analysis && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl z-50 p-6">
          <div className="bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <div className="w-2 h-6 bg-amber-500 rounded-full"></div>
                TRADE PERFORMANCE REPORT
              </h2>
              <button 
                onClick={() => setAnalysis(null)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white outline-none"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto text-slate-300 space-y-6">
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl space-y-4">
                <div className="markdown-body">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-800 flex justify-end gap-4">
               <button 
                onClick={() => setAnalysis(null)}
                className="px-6 py-2 rounded-lg text-slate-400 hover:text-white transition-colors text-sm"
              >
                關閉
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="bg-amber-500 text-black px-8 py-2 rounded-lg font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-900/20 text-sm outline-none"
              >
                RESTART SESSION
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-md z-[60]">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="w-16 h-16 border-2 border-slate-800 rounded-full"></div>
              <div className="w-16 h-16 border-y-2 border-amber-500 rounded-full absolute top-0 left-0 animate-spin"></div>
            </div>
            <p className="text-amber-500 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">Loading Market Data...</p>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-md z-[60]">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="w-16 h-16 border-2 border-slate-800 rounded-full"></div>
              <div className="w-16 h-16 border-y-2 border-amber-500 rounded-full absolute top-0 left-0 animate-spin"></div>
            </div>
            <p className="text-amber-500 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">Computing Strategy Analysis...</p>
          </div>
        </div>
      )}

      {/* Insufficient Balance Alert Modal */}
      {showInsufficientBalanceAlert && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-[70] p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
              <XCircle className="w-8 h-8 text-rose-500" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white">餘額不足</h2>
              <p className="text-slate-400 text-sm">您的帳戶餘額不足以支付交易所須的保證金。</p>
            </div>
            <button 
              onClick={() => setShowInsufficientBalanceAlert(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all outline-none border border-slate-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
