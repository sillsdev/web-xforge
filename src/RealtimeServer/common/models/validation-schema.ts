export interface ValidationSchema {
  // Whether or not the schema allows additional properties
  additionalProperties?: boolean;
  anyOf?: ValidationSchema[];
  bsonType?: string | string[];
  enum?: string[];
  items?: ValidationSchema;
  pattern?: string;
  properties?: SchemaProperties;
  patternProperties?: SchemaProperties;
  required?: string[];
}

export interface SchemaProperties {
  [key: string]: ValidationSchema;
}
