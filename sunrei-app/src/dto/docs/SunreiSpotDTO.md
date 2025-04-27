# SunreiSpotDTO


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** |  | [optional] [default to undefined]
**title** | **string** | Title of the Sunrei Spot | [optional] [default to undefined]
**description** | **string** | Detailed description of the Sunrei Spot | [optional] [default to undefined]
**places** | [**Array&lt;PlaceDTO&gt;**](PlaceDTO.md) | Foreign key to the associated Place | [optional] [default to undefined]

## Example

```typescript
import { SunreiSpotDTO } from './api';

const instance: SunreiSpotDTO = {
    id,
    title,
    description,
    places,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
