import { defineSolidModelSchema } from 'soukai-solid';

import { focusSchemas } from '@/storage/formats';

export const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
export const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default defineSolidModelSchema(focusSchemas.task);
