import { cache } from 'react';
import { getAccess } from './auth';

export const access = cache(getAccess);
