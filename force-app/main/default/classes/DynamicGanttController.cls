public with sharing class DynamicGanttController {
    
    public class OwnerOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;

        public OwnerOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    public class StatusOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;

        public StatusOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
    
    public class GanttWrapper {
        @AuraEnabled public SObject record;
        @AuraEnabled public Decimal progress;
        @AuraEnabled public List<GanttWrapper> children;
        @AuraEnabled public Integer matchCount;

        public GanttWrapper(SObject rec, Decimal prog) {
            this.record = rec;
            this.progress = prog;
            this.children = new List<GanttWrapper>();
            this.matchCount = 0;
        }
    }

    @AuraEnabled
    public static List<GanttWrapper> getGanttData(
        String objectName, 
        String fields, 
        String lookupField, 
        String parentId, 
        String statusField, 
        String startDateField, 
        String searchTerm,
        String specificRecordId
    ) {
        try {
            // 1. Validate mandatory inputs to prevent SOQL errors
            if (String.isBlank(objectName)) {
                throw new AuraHandledException('Object name is required');
            }

            // 2. Validate object exists
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectName);
            if (sObjType == null) {
                throw new AuraHandledException('Object "' + objectName + '" does not exist');
            }

            Map<String, Schema.SObjectField> fieldMap = sObjType.getDescribe().fields.getMap();

            // 3. Clean and prepare fields with validation
            Set<String> fieldSet = new Set<String>{'Id', 'Name'};
            if (String.isNotBlank(fields)) {
                for(String f : fields.deleteWhitespace().split(',')) {
                    if (String.isNotBlank(f)) {
                        if (fieldMap.containsKey(f)) {
                            fieldSet.add(f);
                        } else {
                            System.debug('Warning: Field "' + f + '" does not exist on ' + objectName);
                        }
                    }
                }
            }
            
            if (String.isNotBlank(statusField) && fieldMap.containsKey(statusField)) {
                fieldSet.add(statusField);
            }
            if (String.isNotBlank(startDateField) && fieldMap.containsKey(startDateField)) {
                fieldSet.add(startDateField);
            }
            
            List<String> selectFields = new List<String>(fieldSet);
            if (fieldMap.containsKey('OwnerId')) {
                selectFields.add('Owner.Name');
            }

            String query = 'SELECT ' + String.join(selectFields, ', ') + ' FROM ' + objectName;
            
            // 4. Build Filter Logic with validation
            List<String> conditions = new List<String>();
            
            if (String.isNotBlank(parentId) && String.isNotBlank(lookupField)) {
                if (!fieldMap.containsKey(lookupField)) {
                    throw new AuraHandledException('Lookup field "' + lookupField + '" does not exist on ' + objectName);
                }
                conditions.add(lookupField + ' = :parentId');
            }

            if (String.isNotBlank(specificRecordId)) {
                conditions.add('Id = :specificRecordId');
            }
            
            if (String.isNotBlank(searchTerm)) {
                String dynamicSearch = '%' + String.escapeSingleQuotes(searchTerm) + '%';
                conditions.add('Name LIKE :dynamicSearch');
            }
            
            if (!conditions.isEmpty()) {
                query += ' WHERE ' + String.join(conditions, ' AND ');
            }
            
            // 5. Dynamic Sorting
            if (String.isNotBlank(startDateField)) {
                query += ' ORDER BY ' + startDateField + ' ASC NULLS LAST';
            } else {
                query += ' ORDER BY Name ASC';
            }

            System.debug('Gantt Query: ' + query);

            // 6. Calculate Progress Mapping ONLY if statusField is provided
            Map<String, Decimal> statusMap = new Map<String, Decimal>();
            if (String.isNotBlank(statusField)) {
                statusMap = getStatusProgressMap(objectName, statusField);
            }
            
            // 7. Execute and Wrap
            List<GanttWrapper> results = new List<GanttWrapper>();
            for (SObject so : Database.query(query)) {
                Decimal prog = 0;
                if (String.isNotBlank(statusField)) {
                    String currentStatus = (String)so.get(statusField);
                    prog = (statusMap.containsKey(currentStatus)) ? statusMap.get(currentStatus) : 0;
                }
                results.add(new GanttWrapper(so, prog));
            }
            
            return results;

        } catch (AuraHandledException e) {
            // Re-throw Aura exceptions as-is
            throw e;
        } catch (Exception e) {
            // Log the error and throw a readable exception to the LWC
            System.debug('Gantt Error: ' + e.getMessage() + ' | ' + e.getStackTraceString());
            throw new AuraHandledException('Gantt Data Error: ' + e.getMessage());
        }
    }

    private static Map<String, Decimal> getStatusProgressMap(String objName, String fieldName) {
        Map<String, Decimal> statusMap = new Map<String, Decimal>();
        try {
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objName);
            Schema.DescribeFieldResult fieldRes = sObjType.getDescribe().fields.getMap().get(fieldName).getDescribe();
            
            if (fieldRes.getType() == Schema.DisplayType.PICKLIST) {
                List<Schema.PicklistEntry> ple = fieldRes.getPicklistValues();
                for (Integer i = 0; i < ple.size(); i++) {
                    Decimal percent = (ple.size() > 1) ? (Decimal.valueOf(i) / (ple.size() - 1)) * 100 : 100;
                    statusMap.put(ple[i].getValue(), percent.setScale(0));
                }
            }
        } catch (Exception e) {
            // If field isn't a picklist or doesn't exist, return empty map
        }
        return statusMap;
    }

    @AuraEnabled
    public static Date getOrgToday() {
        return Date.today();
    }

    @AuraEnabled
    public static void updateRecordFields(String objectName, Id recordId, Map<String, Object> fieldValues) {
        if (String.isBlank(objectName)) {
            throw new AuraHandledException('Object name is required');
        }
        if (recordId == null) {
            throw new AuraHandledException('Record Id is required');
        }
        if (fieldValues == null || fieldValues.isEmpty()) {
            throw new AuraHandledException('At least one field value is required');
        }

        Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(objectName);
        if (sObjectType == null) {
            throw new AuraHandledException('Object "' + objectName + '" does not exist');
        }

        Map<String, Schema.SObjectField> objectFields = sObjectType.getDescribe().fields.getMap();
        SObject recordToUpdate = sObjectType.newSObject(recordId);

        for (String fieldApiName : fieldValues.keySet()) {
            if (!objectFields.containsKey(fieldApiName)) {
                continue;
            }

            Object incomingValue = fieldValues.get(fieldApiName);
            Schema.DescribeFieldResult describeField = objectFields.get(fieldApiName).getDescribe();
            if (!describeField.isUpdateable()) {
                continue;
            }
            Schema.DisplayType fieldType = describeField.getType();

            if (incomingValue == null || String.valueOf(incomingValue).trim() == '') {
                recordToUpdate.put(fieldApiName, null);
                continue;
            }

            if (fieldType == Schema.DisplayType.Date) {
                recordToUpdate.put(fieldApiName, Date.valueOf(String.valueOf(incomingValue)));
            } else if (fieldType == Schema.DisplayType.DateTime) {
                String textValue = String.valueOf(incomingValue).trim();
                if (Pattern.matches('^\\d{4}-\\d{2}-\\d{2}$', textValue)) {
                    Date asDate = Date.valueOf(textValue);
                    recordToUpdate.put(fieldApiName, Datetime.newInstance(asDate, Time.newInstance(0, 0, 0, 0)));
                } else if (textValue.endsWith('Z')) {
                    String gmtText = textValue.substring(0, textValue.length() - 1).replace('T', ' ');
                    recordToUpdate.put(fieldApiName, Datetime.valueOfGmt(gmtText));
                } else {
                    recordToUpdate.put(fieldApiName, Datetime.valueOf(textValue.replace('T', ' ')));
                }
            } else {
                recordToUpdate.put(fieldApiName, incomingValue);
            }
        }

        update recordToUpdate;
    }

    @AuraEnabled(cacheable=true)
    public static List<OwnerOption> getAvailableUsers() {
        List<OwnerOption> options = new List<OwnerOption>();
        for (User usr : [
            SELECT Id, Name
            FROM User
            WHERE IsActive = true
            ORDER BY Name ASC
            LIMIT 2000
        ]) {
            options.add(new OwnerOption(usr.Name, usr.Id));
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<StatusOption> getStatusOptions(String objectName, String statusField) {
        List<StatusOption> options = new List<StatusOption>();
        if (String.isBlank(objectName) || String.isBlank(statusField)) {
            return options;
        }

        Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(objectName);
        if (sObjectType == null) {
            return options;
        }

        Map<String, Schema.SObjectField> fields = sObjectType.getDescribe().fields.getMap();
        if (!fields.containsKey(statusField)) {
            return options;
        }

        Schema.DescribeFieldResult describeResult = fields.get(statusField).getDescribe();
        if (describeResult.getType() != Schema.DisplayType.PICKLIST) {
            return options;
        }

        for (Schema.PicklistEntry entry : describeResult.getPicklistValues()) {
            options.add(new StatusOption(entry.getLabel(), entry.getValue()));
        }
        return options;
    }
}
