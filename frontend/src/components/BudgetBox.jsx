import React, { useState, useEffect } from 'react';
import { apiGet, t } from '../api';

export function BudgetBox() {
    const [budget, setBudget] = useState(null);
    useEffect(() => {
        apiGet('/api/budget').then(r => r.ok && setBudget(r.data));
    }, []);

    if (!budget) return null;
    const pct = Math.round((budget.utilized_raw / budget.allocated_raw) * 100);

    return (
        <div className="budget-box mb-3">
            <div>
                <h4>🏛️ {t('budgetAllocated')}</h4>
                <div className="amount">{budget.allocated}</div>
            </div>
            <div className="budget-divider" />
            <div>
                <h4>📊 {t('budgetUtilized')}</h4>
                <div className="amount">{budget.utilized}</div>
                <div className="budget-bar"><div className="budget-bar-fill" style={{ width: pct + '%' }} /></div>
            </div>
            <div>
                <span className="badge badge-blue">{pct}% utilized</span>
            </div>
        </div>
    );
}
