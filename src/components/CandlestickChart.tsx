
import React, { useMemo, useState } from 'react';
import { Candle, Trade, TradeType } from '../types';

interface Props {
  allData: Candle[];
  startIndex: number;
  endIndex: number;
  trades: Trade[];
  maPeriods: number[];
  onScroll?: (newStartIndex: number) => void;
}

export const CandlestickChart: React.FC<Props> = ({ allData, startIndex, endIndex, trades, maPeriods, onScroll }) => {
  const width = 800;
  const height = 400;
  const padding = { top: 20, right: 50, bottom: 30, left: 50 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const data = useMemo(() => {
    if (startIndex === -1 || !allData.length) return [];
    return allData.slice(startIndex, endIndex + 1);
  }, [allData, startIndex, endIndex]);

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (data.length === 0) return { minPrice: 0, maxPrice: 100, maxVolume: 1 };
    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;
    data.forEach(c => {
      min = Math.min(min, c.Low);
      max = Math.max(max, c.High);
      maxVol = Math.max(maxVol, c.Volume || 0);
    });
    const range = max - min || 1;
    return { 
      minPrice: min - range * 0.1, 
      maxPrice: max + range * 0.1,
      maxVolume: maxVol || 1
    };
  }, [data]);

  const priceChartHeight = chartHeight * 0.8;
  const volumeChartHeight = chartHeight * 0.15;
  const volumeTop = padding.top + priceChartHeight + (chartHeight * 0.05);

  const getY = (price: number) => {
    return padding.top + priceChartHeight - ((price - minPrice) / (maxPrice - minPrice)) * priceChartHeight;
  };

  const getVolY = (volume: number) => {
    return volumeTop + volumeChartHeight - (volume / maxVolume) * volumeChartHeight;
  };

  const getX = (index: number) => {
    // If we have fewer candles than expected viewport (e.g. 80), don't stretch them too much
    // Or just keep the logic same
    return padding.left + (index / Math.max(79, data.length - 1)) * chartWidth;
  };

  // Calculate MAs using the full data context
  const maLines = useMemo(() => {
    return maPeriods.map(period => {
      const points: string[] = [];
      for (let i = 0; i < data.length; i++) {
        const globalIndex = startIndex + i;
        if (globalIndex < period - 1) continue;
        
        // Calculate average using allData
        const slice = allData.slice(globalIndex - period + 1, globalIndex + 1);
        const avg = slice.reduce((sum, c) => sum + c.Close, 0) / period;
        points.push(`${getX(i)},${getY(avg)}`);
      }
      return points.join(' ');
    });
  }, [allData, startIndex, data, maPeriods, minPrice, maxPrice]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [initialScrollIndex, setInitialScrollIndex] = useState<number>(startIndex);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setInitialScrollIndex(startIndex);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging && dragStartX !== null && onScroll) {
      const deltaX = e.clientX - dragStartX;
      // Calculate how many candles deltaX represents
      const candlePxWidth = chartWidth / 80;
      const indexDelta = Math.round(deltaX / candlePxWidth);
      
      const newStart = Math.max(0, initialScrollIndex - indexDelta);
      // Don't scroll past current data
      const maxStart = Math.max(0, (allData.findIndex(c => c.timestamp === allData[endIndex]?.timestamp) || 0));
      // Actually, just let it scroll. App will handle constraints if needed.
      onScroll(newStart);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    
    if (svgX < padding.left || svgX > width - padding.right) {
      setHoveredIndex(null);
      return;
    }

    const chartX = svgX - padding.left;
    const index = Math.round((chartX / chartWidth) * (data.length - 1));
    
    if (index >= 0 && index < data.length) {
      setHoveredIndex(index);
    } else {
      setHoveredIndex(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStartX(null);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setHoveredIndex(null);
    }
  };

  const handleGlobalMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStartX(null);
    }
  };

  React.useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col group select-none">
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div className="absolute top-2 left-12 right-12 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/50 text-[10px] md:text-xs font-mono flex flex-wrap gap-x-4 gap-y-1 z-10 shadow-xl pointer-events-none">
          <div className="flex gap-1.5"><span className="text-blue-400 font-bold">{data[hoveredIndex].Date}</span> <span className="text-slate-400">{data[hoveredIndex].Time}</span></div>
          <div className="flex gap-1.5"><span className="text-slate-500 font-bold">O</span> <span className="text-slate-100 font-medium">{Math.round(data[hoveredIndex].Open).toLocaleString()}</span></div>
          <div className="flex gap-1.5"><span className="text-slate-500 font-bold">H</span> <span className="text-rose-400 font-medium">{Math.round(data[hoveredIndex].High).toLocaleString()}</span></div>
          <div className="flex gap-1.5"><span className="text-slate-500 font-bold">L</span> <span className="text-emerald-400 font-medium">{Math.round(data[hoveredIndex].Low).toLocaleString()}</span></div>
          <div className="flex gap-1.5"><span className="text-slate-500 font-bold">C</span> <span className="text-slate-100 font-medium">{Math.round(data[hoveredIndex].Close).toLocaleString()}</span></div>
          <div className="flex gap-1.5"><span className="text-slate-500 font-bold">V</span> <span className="text-amber-400 font-medium">{Math.round(data[hoveredIndex].Volume || 0).toLocaleString()}</span></div>
          {maPeriods.map((period, i) => {
            const globalIndex = startIndex + hoveredIndex;
            if (globalIndex < period - 1) return null;
            const slice = allData.slice(globalIndex - period + 1, globalIndex + 1);
            const avg = slice.reduce((sum, c) => sum + c.Close, 0) / period;
            const colors = ['#60a5fa', '#a855f7', '#f59e0b', '#ef4444', '#10b981', '#6366f1'];
            return (
              <div key={period} className="flex gap-1.5">
                <span className="font-bold" style={{ color: colors[i % 6] }}>MA{period}</span>
                <span className="text-slate-100 font-medium">{Math.round(avg).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
      <svg 
        width="100%" 
        height="100%" 
        preserveAspectRatio="none" 
        viewBox={`0 0 ${width} ${height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="cursor-crosshair active:cursor-grabbing"
      >
        {/* Price Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(tick => (
          <line
            key={tick}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + tick * priceChartHeight}
            y2={padding.top + tick * priceChartHeight}
            stroke="#1e293b"
            strokeWidth="1"
          />
        ))}

        {/* Volume Bars */}
        {data.map((candle, i) => {
          const x = getX(i);
          const barWidth = Math.max(1, (chartWidth / data.length) * 0.8);
          const isUp = candle.Close >= candle.Open;
          const hexColor = isUp ? '#ef4444' : '#10b981';
          const volY = getVolY(candle.Volume || 0);

          return (
            <rect
              key={`vol-${i}`}
              x={x - barWidth / 2}
              y={volY}
              width={barWidth}
              height={volumeTop + volumeChartHeight - volY}
              fill={hexColor}
              opacity={0.3}
            />
          );
        })}

        {/* Candles */}
        {data.map((candle, i) => {
          const x = getX(i);
          const candleWidth = Math.max(2, (chartWidth / data.length) * 0.7);
          const isUp = candle.Close >= candle.Open;
          // Theme palette: Rose for Up, Emerald for Down
          const hexColor = isUp ? '#ef4444' : '#10b981';

          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={getY(candle.High)}
                y2={getY(candle.Low)}
                stroke={hexColor}
                strokeWidth={1}
              />
              <rect
                x={x - candleWidth / 2}
                y={isUp ? getY(candle.Close) : getY(candle.Open)}
                width={candleWidth}
                height={Math.max(1, Math.abs(getY(candle.Close) - getY(candle.Open)))}
                fill={hexColor}
              />
            </g>
          );
        })}

        {/* Crosshair Line */}
        {hoveredIndex !== null && (
          <line
            x1={getX(hoveredIndex)}
            x2={getX(hoveredIndex)}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
          />
        )}

        {/* MA Lines */}
        {maLines.map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke={['#60a5fa', '#a855f7', '#f59e0b', '#ef4444', '#10b981', '#6366f1'][i % 6]}
            strokeWidth={2.5}
            opacity={0.7}
          />
        ))}

        {/* Trade Markers */}
        {trades.map((trade, i) => {
          const index = data.findIndex(c => c.timestamp === trade.timestamp);
          if (index === -1) return null;
          const x = getX(index);
          const candle = data[index];
          const isBuy = trade.type === TradeType.BUY;
          
          if (isBuy) {
            // Triangle Pointing Up (Buy) -> Theme Blue
            return (
              <polygon
                key={i}
                points={`${x},${getY(candle.Low) + 5} ${x - 6},${getY(candle.Low) + 15} ${x + 6},${getY(candle.Low) + 15}`}
                fill="#60a5fa"
              />
            );
          } else {
            // Triangle Pointing Down (Sell) -> Theme Amber
            return (
              <polygon
                key={i}
                points={`${x},${getY(candle.High) - 5} ${x - 6},${getY(candle.High) - 15} ${x + 6},${getY(candle.High) - 15}`}
                fill="#f59e0b"
              />
            );
          }
        })}
      </svg>
    </div>
  );
};
