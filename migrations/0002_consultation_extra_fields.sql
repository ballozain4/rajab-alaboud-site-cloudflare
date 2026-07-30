ALTER TABLE consultations
ADD COLUMN extra_fields_json TEXT NOT NULL DEFAULT '{}';
