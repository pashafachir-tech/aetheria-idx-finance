"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { searchIdxTickers, type IdxTickerItem } from "../../lib/idx-universe";

export interface TickerAutocompleteProps {
  /** Initial or controlled value */
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Callback fired when a ticker is selected or submitted via Enter */
  onSelectTicker: (ticker: string) => void;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional container class name */
  className?: string;
  /** Optional input class name */
  inputClassName?: string;
  /** Ref forwarded to the input element (for Cmd+K focus etc.) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Max input character length */
  maxLength?: number;
  /** Aria label for accessibility */
  ariaLabel?: string;
  /** Alignment of dropdown */
  dropdownAlign?: "left" | "right";
  /** Width mode */
  fullWidth?: boolean;
  /** On change raw text */
  onChange?: (val: string) => void;
  /** On submit button click if embedded */
  showSubmitBtn?: boolean;
  submitBtnText?: string;
}

export function TickerAutocomplete({
  value,
  defaultValue = "",
  placeholder = "Cari ticker atau nama emiten, mis. BBCA / Bank Mandiri",
  onSelectTicker,
  size = "md",
  className = "",
  inputClassName = "",
  inputRef: externalInputRef,
  autoFocus = false,
  maxLength = 16,
  ariaLabel = "Cari ticker Bursa Efek Indonesia",
  dropdownAlign = "left",
  fullWidth = true,
  onChange,
  showSubmitBtn = false,
  submitBtnText = "Run Engine →",
}: TickerAutocompleteProps) {
  const [internalQuery, setInternalQuery] = useState(value ?? defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [results, setResults] = useState<IdxTickerItem[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const listboxId = useId();

  // Keep query in sync if value prop changes externally
  useEffect(() => {
    if (value !== undefined) {
      setInternalQuery(value);
    }
  }, [value]);

  // Execute instant client-side search (0ms latency, zero quota)
  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setInternalQuery(newQuery);
      if (onChange) onChange(newQuery);

      const trimmed = newQuery.trim();
      if (trimmed.length === 0) {
        setResults([]);
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else {
        const matches = searchIdxTickers(trimmed, 8);
        setResults(matches);
        setIsOpen(true);
        setHighlightedIndex(matches.length > 0 ? 0 : -1);
      }
    },
    [onChange]
  );

  // Commit selected ticker
  const commitSelection = useCallback(
    (tickerSymbol: string) => {
      const clean = tickerSymbol.trim().toUpperCase();
      if (!clean) return;
      setInternalQuery(clean);
      setIsOpen(false);
      setHighlightedIndex(-1);
      onSelectTicker(clean);
    },
    [onSelectTicker]
  );

  // Submit current state
  const handleSubmitCurrent = useCallback(() => {
    if (isOpen && highlightedIndex >= 0 && results[highlightedIndex]) {
      commitSelection(results[highlightedIndex].ticker);
      return;
    }
    const clean = internalQuery.trim().toUpperCase();
    if (clean) {
      commitSelection(clean);
    } else if (results.length > 0) {
      commitSelection(results[0].ticker);
    }
  }, [isOpen, highlightedIndex, results, internalQuery, commitSelection]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          const matches = searchIdxTickers(internalQuery.trim(), 8);
          setResults(matches);
          setIsOpen(true);
          setHighlightedIndex(matches.length > 0 ? 0 : -1);
        } else if (results.length > 0) {
          setHighlightedIndex((prev) => (prev + 1) % results.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (isOpen && results.length > 0) {
          setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmitCurrent();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    },
    [isOpen, results, internalQuery, handleSubmitCurrent]
  );

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle focus
  const handleFocus = useCallback(() => {
    const trimmed = internalQuery.trim();
    if (trimmed.length > 0) {
      const matches = searchIdxTickers(trimmed, 8);
      setResults(matches);
      setIsOpen(true);
      setHighlightedIndex(matches.length > 0 ? 0 : -1);
    }
  }, [internalQuery]);

  return (
    <div
      ref={containerRef}
      className={`wb-autocomplete-wrap wb-autocomplete-wrap--${size} ${fullWidth ? "wb-autocomplete-wrap--full" : ""} ${className}`}
      style={{ position: "relative" }}
    >
      <div className="wb-autocomplete-input-group">
        <div className="wb-autocomplete-input-inner">
          <input
            ref={inputRef}
            type="text"
            className={`wb-autocomplete-input wb-autocomplete-input--${size} ${inputClassName}`}
            value={internalQuery}
            onChange={(e) => handleQueryChange(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={isOpen}
            role="combobox"
            autoComplete="off"
            spellCheck="false"
          />
          {internalQuery && (
            <button
              type="button"
              className="wb-autocomplete-clear-btn"
              onClick={() => {
                handleQueryChange("");
                inputRef.current?.focus();
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {showSubmitBtn && (
          <button
            type="button"
            className="wb-autocomplete-submit-btn"
            onClick={handleSubmitCurrent}
          >
            {submitBtnText}
          </button>
        )}
      </div>

      {/* Floating Popover Dropdown */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className={`wb-autocomplete-dropdown wb-autocomplete-dropdown--${size} wb-autocomplete-dropdown--${dropdownAlign}`}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [dropdownAlign === "right" ? "right" : "left"]: 0,
            zIndex: 99999,
          }}
        >
          {results.length > 0 ? (
            <>
              <div className="wb-autocomplete-header">
                <span>IDX EMITEN MATCHES ({results.length})</span>
                <small>0ms Client-Side Filter</small>
              </div>
              <ul className="wb-autocomplete-list">
                {results.map((item, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <li
                      key={item.ticker}
                      id={`idx-ticker-${item.ticker}`}
                      role="option"
                      aria-selected={isHighlighted}
                      className={`wb-autocomplete-item ${isHighlighted ? "wb-autocomplete-item--active" : ""}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => commitSelection(item.ticker)}
                    >
                      <div className="wb-autocomplete-item-main">
                        <span className="wb-autocomplete-ticker">{item.ticker}</span>
                        <span className="wb-autocomplete-name" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <span className="wb-autocomplete-sector">{item.sector}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="wb-autocomplete-footer">
                <span>Gunakan <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigasi · <kbd className="kbd">Enter</kbd> pilih</span>
              </div>
            </>
          ) : (
            <div className="wb-autocomplete-empty">
              <div className="wb-autocomplete-empty-text">
                Tidak ada emiten resmi IDX yang cocok dengan <b>&ldquo;{internalQuery}&rdquo;</b>
              </div>
              <button
                type="button"
                className="wb-autocomplete-custom-btn"
                onClick={() => commitSelection(internalQuery)}
              >
                Tetap Cari Ticker Kustom <b>{internalQuery.toUpperCase()}</b> (Enter) →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TickerAutocomplete;
