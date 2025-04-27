# SunreiDTO


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** |  | [optional] [default to undefined]
**title** | **string** | Title of the Sunrei Spot | [optional] [default to undefined]
**description** | **string** | Detailed description of the Sunrei Spot | [optional] [default to undefined]
**spots** | [**Array&lt;SunreiSpotDTO&gt;**](SunreiSpotDTO.md) | Foreign key to the associated Place | [optional] [default to undefined]

## Example

```typescript
import { SunreiDTO } from './api';

const instance: SunreiDTO = {
    id,
    title,
    description,
    spots,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
