import { useEffect, useReducer, Reducer } from 'react';
import { getReferrals } from '@proton/shared/lib/api/core/referrals';
import { Referral } from '@proton/shared/lib/interfaces';

import { useApi } from '../../../hooks';

interface ReferralApiResult {
    Referrals?: Referral[];
    Total?: number;
}

type Action = { type: 'success'; payload: ReferralApiResult } | { type: 'error' };

export interface UseReferralsReducerState {
    referrals: Referral[];
    loading: boolean;
    total: number;
}

const getDefaultState = () => ({
    loading: true,
    referrals: [],
    total: 0,
});

const useReferrals = () => {
    const api = useApi();
    const [referralState, dispatch] = useReducer<Reducer<UseReferralsReducerState, Action>>((prevState, action) => {
        if (action.type === 'error') {
            return { ...prevState, loading: false };
        }

        if (action.type === 'success') {
            const apiResult = action.payload;

            return {
                loading: false,
                referrals: apiResult.Referrals || [],
                total: apiResult.Total || 0,
            };
        }

        return getDefaultState();
    }, getDefaultState());

    useEffect(() => {
        const fetchReferrals = async () => {
            try {
                const apiResults = await api<ReferralApiResult>(getReferrals({ page: 0 }));
                dispatch({ type: 'success', payload: apiResults });
            } catch (error: any) {
                dispatch({ type: 'error' });
            }
        };

        void fetchReferrals();
    }, []);

    return referralState;
};

export default useReferrals;