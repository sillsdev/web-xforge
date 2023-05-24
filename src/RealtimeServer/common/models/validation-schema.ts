export interface ValidationSchema {
  additionalProperties?: boolean;
  bsonType?: string | string[];
  enum?: string[];
  items?: ValidationSchema;
  pattern?: string;
  properties?: { [key: string]: ValidationSchema };
  required?: string[];
}
