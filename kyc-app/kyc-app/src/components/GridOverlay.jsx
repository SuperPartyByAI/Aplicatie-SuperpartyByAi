import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWheel } from '../contexts/WheelContext';
import { getAvailableButtons, getButtonById, GRID_CONFIG, DEFAULT_GRID_LAYOUT } from '../config/gridButtons';
import './GridOverlay.css';

const STORAGE_KEY = 'superparty_grid_layout';

export default function GridOverlay() {
  const { isWheelOpen, closeWheel, adminMode, gmMode, setAdminMode, setGmMode } = useWheel();
  const navigate = useNavigate();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [gridLayout, setGridLayout] = useState(() => {
    // Load saved layout from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { ...DEFAULT_GRID_LAYOUT };
  });
  const [draggedButton, setDraggedButton] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Touch swipe state
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  // Get available buttons based on current mode
  const availableButtons = getAvailableButtons(adminMode, gmMode);

  // Calculate total pages based on button positions
  useEffect(() => {
    const maxPage = Math.max(
      1,
      ...Object.values(gridLayout).map(pos => pos.page)
    );
    setTotalPages(maxPage);
  }, [gridLayout]);

  // Save layout to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridLayout));
  }, [gridLayout]);

  // Build grid structure for current page
  const buildGrid = () => {
    const grid = Array(GRID_CONFIG.ROWS).fill(null).map(() => 
      Array(GRID_CONFIG.COLS).fill(null)
    );

    // Place buttons in their positions
    Object.entries(gridLayout).forEach(([buttonId, position]) => {
      if (position.page === currentPage) {
        const button = getButtonById(buttonId);
        if (button && availableButtons.find(b => b.id === buttonId)) {
          const rowIdx = position.row - 1;
          const colIdx = position.col - 1;
          if (rowIdx >= 0 && rowIdx < GRID_CONFIG.ROWS && 
              colIdx >= 0 && colIdx < GRID_CONFIG.COLS) {
            grid[rowIdx][colIdx] = button;
          }
        }
      }
    });

    return grid;
  };

  const handleButtonClick = (button) => {
    if (isEditMode) return; // Don't navigate in edit mode

    if (button.route) {
      navigate(button.route);
      closeWheel();
    } else if (button.action) {
      // Handle actions
      switch (button.action) {
        case 'exitAdminMode':
          setAdminMode(false);
          break;
        case 'exitGMMode':
          setGmMode(false);
          break;
        case 'loadKycSubmissions':
          navigate('/admin/kyc-submissions');
          break;
        case 'loadAiConversations':
          navigate('/admin/ai-conversations');
          break;
        case 'loadPerformanceMetrics':
          navigate('/gm/metrics');
          break;
        case 'setView':
          if (button.actionParam === 'gm-analytics') {
            navigate('/gm/analytics');
          }
          break;
        default:
          console.log('Unknown action:', button.action);
      }
      closeWheel();
    }
  };

  const handleDragStart = (button, e) => {
    if (!isEditMode) return;
    setDraggedButton(button);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (row, col, e) => {
    if (!isEditMode || !draggedButton) return;
    e.preventDefault();

    const newPosition = {
      page: currentPage,
      row: row + 1,
      col: col + 1,
    };

    // Check if target slot is occupied
    const occupiedBy = Object.entries(gridLayout).find(([id, pos]) => 
      pos.page === newPosition.page && 
      pos.row === newPosition.row && 
      pos.col === newPosition.col &&
      id !== draggedButton.id
    );

    if (occupiedBy) {
      // Swap positions
      const [occupiedId, occupiedPos] = occupiedBy;
      const draggedPos = gridLayout[draggedButton.id];
      
      setGridLayout(prev => ({
        ...prev,
        [draggedButton.id]: newPosition,
        [occupiedId]: draggedPos || { page: currentPage, row: 1, col: 1 },
      }));
    } else {
      // Move to empty slot
      setGridLayout(prev => ({
        ...prev,
        [draggedButton.id]: newPosition,
      }));
    }

    setDraggedButton(null);
  };

  const handleAddPage = () => {
    setTotalPages(prev => prev + 1);
    setCurrentPage(totalPages + 1);
  };

  const handleResetLayout = () => {
    if (confirm('Resetează layout-ul la setările implicite?')) {
      setGridLayout({ ...DEFAULT_GRID_LAYOUT });
      setCurrentPage(1);
    }
  };

  // Swipe handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    if (isEditMode) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    if (isEditMode) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (isEditMode || !touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
    if (isRightSwipe && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  if (!isWheelOpen) return null;

  const grid = buildGrid();

  return (
    <div className="grid-overlay" onClick={closeWheel}>
      <div className="grid-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="grid-header">
          <button 
            className={`edit-mode-toggle ${isEditMode ? 'active' : ''}`}
            onClick={() => setIsEditMode(!isEditMode)}
          >
            {isEditMode ? '✓ Gata' : '✏️ Editează'}
          </button>
          
          <div className="page-indicator">
            Pagina {currentPage} / {totalPages}
          </div>

          <button className="close-button" onClick={closeWheel}>
            ✕
          </button>
        </div>

        {/* Grid */}
        <div 
          className="grid-content"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {grid.map((row, rowIdx) => (
            <div key={rowIdx} className="grid-row">
              {row.map((button, colIdx) => (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className={`grid-slot ${button ? 'occupied' : 'empty'} ${isEditMode ? 'edit-mode' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(rowIdx, colIdx, e)}
                >
                  {button ? (
                    <button
                      className="grid-button"
                      style={{ background: button.gradient }}
                      onClick={() => handleButtonClick(button)}
                      draggable={isEditMode}
                      onDragStart={(e) => handleDragStart(button, e)}
                    >
                      <span className="button-icon">{button.icon}</span>
                      <span className="button-label">{button.label}</span>
                    </button>
                  ) : isEditMode ? (
                    <div className="empty-slot-indicator">+</div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer - Page Navigation */}
        <div className="grid-footer">
          <button
            className="page-nav-button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            ← Înapoi
          </button>

          <div className="page-dots">
            {Array(totalPages).fill(null).map((_, idx) => (
              <button
                key={idx}
                className={`page-dot ${currentPage === idx + 1 ? 'active' : ''}`}
                onClick={() => setCurrentPage(idx + 1)}
              />
            ))}
          </div>

          <button
            className="page-nav-button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            Înainte →
          </button>
        </div>

        {/* Edit Mode Actions */}
        {isEditMode && (
          <div className="edit-actions">
            <button className="action-button" onClick={handleAddPage}>
              + Pagină Nouă
            </button>
            <button className="action-button danger" onClick={handleResetLayout}>
              🔄 Resetează
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
