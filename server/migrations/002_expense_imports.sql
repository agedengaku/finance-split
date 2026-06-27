CREATE TABLE IF NOT EXISTS expense_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  row_count INT UNSIGNED NOT NULL,
  total_amount BIGINT UNSIGNED NOT NULL,
  imported_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY expense_imports_period_idx (period_id, created_at),
  CONSTRAINT expense_imports_period_fk
    FOREIGN KEY (period_id) REFERENCES periods (id) ON DELETE CASCADE,
  CONSTRAINT expense_imports_imported_by_fk
    FOREIGN KEY (imported_by) REFERENCES users (id)
);

ALTER TABLE expenses
  ADD COLUMN import_id BIGINT UNSIGNED NULL AFTER period_id,
  ADD KEY expenses_import_idx (import_id),
  ADD CONSTRAINT expenses_import_fk
    FOREIGN KEY (import_id) REFERENCES expense_imports (id) ON DELETE CASCADE;
