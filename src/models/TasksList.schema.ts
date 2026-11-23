import { defineSolidContainerSchema } from 'soukai-solid';

import { focusSchemas } from '@/storage/formats';

export const tasksListFields = focusSchemas.list.fields;

export default defineSolidContainerSchema(focusSchemas.list);
