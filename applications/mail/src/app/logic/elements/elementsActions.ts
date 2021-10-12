import { createAction, createAsyncThunk } from '@reduxjs/toolkit';
import { noop } from '@proton/shared/lib/helpers/function';
import { ESResults, EventUpdates, NewStateParams, QueryParams, QueryResults } from './elementsTypes';
import { Element } from '../../models/element';
import { getQueryElementsParameters, queryElement, queryElements } from './helpers/elementQuery';

export const reset = createAction<NewStateParams>('elements/reset');

export const updatePage = createAction<number>('elements/updatePage');

export const load = createAsyncThunk<QueryResults, QueryParams>('elements/load', async (queryParams: QueryParams) => {
    console.log('load', queryParams);
    const queryParameters = getQueryElementsParameters(queryParams);
    try {
        return await queryElements(queryParams.api, queryParams.conversationMode, queryParameters);
    } catch (error) {
        // Wait a couple of seconds before retrying
        setTimeout(() => {
            // setCache((cache) => ({
            //     ...cache,
            //     beforeFirstLoad: false,
            //     invalidated: false,
            //     pendingRequest: false,
            //     retry: newRetry(queryParameters, error),
            // }));
        }, 2000);
        throw error;
    }
});

export const removeExpired = createAction<Element>('elements/removeExpired');

export const invalidate = createAction<void>('elements/invalidate');

export const eventUpdates = createAsyncThunk<(Element | undefined)[], EventUpdates>(
    'elements/eventUpdates',
    async ({ api, conversationMode, toLoad }) => {
        return Promise.all(toLoad.map(async (elementID) => queryElement(api, conversationMode, elementID).catch(noop)));
    }
);

export const manualPending = createAction<void>('elements/manualPending');

export const manualFulfilled = createAction<void>('elements/manualFulfilled');

export const addESResults = createAction<ESResults>('elements/addESResults');
