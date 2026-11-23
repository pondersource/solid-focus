import { defineSolidContainerSchema } from 'soukai-solid';

import { focusSchemas } from '@/storage/formats';
import TasksList from '@/models/TasksList';

export default defineSolidContainerSchema(TasksList, focusSchemas.workspace);
